import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, feriasSaldoInicialSchema } from "@/lib/schemas";
import { autorizarFerias, carregarFuncionarioElegivel, garantirPeriodos, respostaDeErro, temPeriodoOperadoPeloRH } from "@/lib/feriasPeriodos";
import { resolverSaldoInicial } from "@/lib/feriasRegras";
import { hojeBrasiliaISO, formatarDataBR } from "@/lib/rescisaoProgramada";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

// Saldo inicial da implantação: a contabilidade informa o FIM do último período aquisitivo já quitado (ou "nenhum" = quitado_ate nulo). Os períodos que
// terminam até essa data viram "gozada" com origem 'saldo_inicial'. Se a data não bate com o fim de nenhum período, a rota responde 409 com o período
// mais próximo e o RH confirma reenviando `fim_confirmado` (nunca decide no escuro). Quando já existe período terminado e o saldo ainda não foi
// confirmado, o funcionário fica cinza ("Saldo inicial pendente"): nada vira vencido nem dispara aviso. Quem ainda não tem período terminado
// (menos de 12 meses de casa) não precisa disto: vale "nenhum", calculado na hora.
// Refazer é possível enquanto o RH não lançou férias (programada, em gozo ou gozada) neste funcionário.
export async function POST(request: NextRequest, { params }: Params) {
  const { funcionarioId } = await params;
  const auth = await autorizarFerias(funcionarioId);
  if ("erro" in auth) return auth.erro;
  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(feriasSaldoInicialSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  const carregado = await carregarFuncionarioElegivel(svc, funcionarioId);
  if ("erro" in carregado) return carregado.erro;
  const funcionario = carregado.funcionario;
  const hoje = hojeBrasiliaISO();
  const garantido = await garantirPeriodos(svc, funcionario, hoje);
  if ("erroResposta" in garantido) return garantido.erroResposta;
  const { estado } = garantido;

  switch (estado.avaliacao.estado) {
    case "sem_data_base":
      return NextResponse.json({ error: "Informe a data-base deste funcionário antes de informar as férias já quitadas." }, { status: 409 });
    case "ainda_nao_iniciou":
      return NextResponse.json({ error: "A data-base deste funcionário ainda não chegou: não há período para quitar." }, { status: 409 });
    case "base_alterada":
      return NextResponse.json({ error: "A data-base mudou depois de gerar os períodos. Reconfirme a data-base antes de informar as férias já quitadas." }, { status: 409 });
    default:
      break;
  }
  const dataBase = estado.dataBase as string; // estado "ok" ou "saldo_pendente" sempre tem data-base
  if (temPeriodoOperadoPeloRH(estado.periodos)) {
    return NextResponse.json({ error: "Já há férias programadas, em férias ou tiradas deste funcionário. Reabra-as antes de refazer as férias já quitadas." }, { status: 409 });
  }

  const resultado = resolverSaldoInicial(dataBase, d.quitado_ate, hoje);
  if (resultado.tipo === "invalido") return NextResponse.json({ error: resultado.motivo }, { status: 400 });

  let fimAplicado: string | null = null;
  let numeroAplicado = 0;
  if (resultado.tipo === "exato") {
    fimAplicado = resultado.aquisitivo_fim;
    numeroAplicado = resultado.numero;
  } else if (resultado.tipo === "aproximado") {
    if (d.fim_confirmado !== resultado.sugestao.aquisitivo_fim) {
      return NextResponse.json(
        {
          error: `${formatarDataBR(resultado.informado)} não é o fim de nenhum período aquisitivo. O período mais próximo termina em ${formatarDataBR(resultado.sugestao.aquisitivo_fim)} (período ${resultado.sugestao.numero}). Confirme para usar essa data.`,
          code: "confirmar_periodo",
          sugestao: resultado.sugestao,
          informado: resultado.informado,
        },
        { status: 409 }
      );
    }
    fimAplicado = resultado.sugestao.aquisitivo_fim;
    numeroAplicado = resultado.sugestao.numero;
  }

  const agora = new Date().toISOString();
  const refeito = estado.saldoConfirmado;
  const jaQuitados = estado.periodos.filter((p) => p.origem === "saldo_inicial").map((p) => p.numero);

  // Ordem pensada para falhar "para o lado seguro" (cinza, nunca vencido por engano): 1) se já estava confirmado, volta para pendente; 2) desfaz o saldo
  // anterior; 3) quita os períodos novos; 4) só então confirma. Falha no meio deixa o funcionário em "Saldo inicial pendente", e a ação pode ser repetida.
  if (refeito) {
    const { error } = await svc
      .from("ferias_config")
      .update({ saldo_inicial_confirmado_em: null, saldo_inicial_confirmado_por: null, saldo_inicial_quitado_ate: null })
      .eq("funcionario_id", funcionarioId);
    if (error) return respostaDeErro(error, "reabrir o saldo inicial");
  }
  if (jaQuitados.length > 0) {
    const { error } = await svc
      .from("ferias_periodos")
      .update({ situacao: "a_programar", origem: "gerado", gozo_inicio: null, gozo_fim: null, atualizado_por: user.id, atualizado_em: agora })
      .eq("funcionario_id", funcionarioId)
      .eq("origem", "saldo_inicial");
    if (error) return respostaDeErro(error, "desfazer o saldo anterior");
  }
  if (fimAplicado) {
    const { error } = await svc
      .from("ferias_periodos")
      .update({ situacao: "gozada", origem: "saldo_inicial", atualizado_por: user.id, atualizado_em: agora })
      .eq("funcionario_id", funcionarioId)
      .lte("numero", numeroAplicado)
      .eq("situacao", "a_programar");
    if (error) return respostaDeErro(error, "quitar os períodos");
  }
  const { error: erroConfig } = await svc.from("ferias_config").upsert(
    {
      funcionario_id: funcionarioId, saldo_inicial_confirmado_em: agora, saldo_inicial_confirmado_por: user.id, saldo_inicial_quitado_ate: fimAplicado,
    },
    { onConflict: "funcionario_id" }
  );
  if (erroConfig) return respostaDeErro(erroConfig, "confirmar o saldo inicial");

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "ferias_saldo_inicial",
    entidade: "ferias_config",
    entidade_id: funcionarioId,
    detalhes: {
      funcionario_id: funcionarioId, quitado_ate_informado: d.quitado_ate, fim_aplicado: fimAplicado, nenhum: fimAplicado === null,
      periodos_quitados: fimAplicado ? Array.from({ length: numeroAplicado }, (_, i) => i + 1) : [], refeito, periodos_quitados_antes: jaQuitados,
    },
    unidade_id: funcionario.unidade_id,
  });

  return NextResponse.json({ data: { funcionario_id: funcionarioId, saldo_inicial_confirmado: true, quitado_ate: fimAplicado, periodos_quitados: fimAplicado ? numeroAplicado : 0 } });
}
