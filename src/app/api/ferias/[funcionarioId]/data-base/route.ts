import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, feriasDataBaseSchema } from "@/lib/schemas";
import {
  autorizarFerias, carregarDadosFerias, carregarFuncionarioElegivel, garantirPeriodos, respostaDeErro, temPeriodoOperadoPeloRH,
} from "@/lib/feriasPeriodos";
import { periodosDivergentes, resolverDataBase } from "@/lib/feriasRegras";
import { hojeBrasiliaISO, formatarDataBR } from "@/lib/rescisaoProgramada";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

// Ano mínimo aceito (erro de digitação como 1924 geraria dezenas de períodos) e folga para admissão logo à frente.
const DATA_BASE_MINIMA = "1990-01-01";

function dataMaisUmAno(hojeISO: string): string {
  const [a, m, d] = hojeISO.split("-").map(Number);
  return new Date(Date.UTC(a + 1, m - 1, d)).toISOString().slice(0, 10);
}

// Ajuste da data-base pelo RH (intervalo entre contratos, admissão divergente, legado sem data). Motivo obrigatório; fica registrado quem, quando e por quê
// (ferias_config + auditoria). data_base nula volta a usar a data de admissão. Mudar a data-base muda todos os períodos, então:
//  - trava se já há férias programadas, em gozo ou gozadas lançadas pelo RH (reabra antes);
//  - apaga os períodos e ZERA o saldo inicial (precisa ser informado de novo): sem `confirmar_reinicio` a rota responde 409 explicando e não muda nada.
// Mesmo sem mudar a data, vale para "reconfirmar" quando os períodos guardados não batem com a data-base atual (data_admissao editada depois).
export async function POST(request: NextRequest, { params }: Params) {
  const { funcionarioId } = await params;
  const auth = await autorizarFerias(funcionarioId);
  if ("erro" in auth) return auth.erro;
  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(feriasDataBaseSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  const carregado = await carregarFuncionarioElegivel(svc, funcionarioId);
  if ("erro" in carregado) return carregado.erro;
  const funcionario = carregado.funcionario;
  const hoje = hojeBrasiliaISO();

  if (d.data_base !== null) {
    if (d.data_base < DATA_BASE_MINIMA) return NextResponse.json({ error: "Data-base inválida (anterior a 1990)." }, { status: 400 });
    if (d.data_base > dataMaisUmAno(hoje)) return NextResponse.json({ error: "A data-base não pode estar a mais de 1 ano no futuro." }, { status: 400 });
  }

  const { dados, erro: erroCarga } = await carregarDadosFerias(svc, [funcionarioId]);
  if (erroCarga) return respostaDeErro(erroCarga, "carregar");
  const config = dados.configs.get(funcionarioId);
  const periodos = dados.periodos.get(funcionarioId) ?? [];

  const baseAtual = resolverDataBase(funcionario.data_admissao, config?.data_base_ajustada);
  // Data igual à admissão = sem ajuste (guardar nulo). Data nula = usar a admissão.
  const ajustada = d.data_base && d.data_base !== funcionario.data_admissao ? d.data_base : null;
  const baseNova = resolverDataBase(funcionario.data_admissao, ajustada);
  if (!baseNova) return NextResponse.json({ error: "Este funcionário não tem data de admissão. Informe a data-base." }, { status: 400 });

  const divergente = baseAtual ? periodosDivergentes(baseAtual, periodos) : false;
  if (baseNova === baseAtual && !divergente) {
    return NextResponse.json({ error: `A data-base já é ${formatarDataBR(baseNova)}.` }, { status: 400 });
  }
  if (temPeriodoOperadoPeloRH(periodos)) {
    return NextResponse.json({ error: "Já há férias programadas, em gozo ou gozadas deste funcionário. Reabra-as antes de ajustar a data-base." }, { status: 409 });
  }
  const periodosQuitados = periodos.filter((p) => p.origem === "saldo_inicial").length;
  const saldoSeraZerado = !!config?.saldo_inicial_confirmado_em;
  if ((saldoSeraZerado || periodos.length > 0) && !d.confirmar_reinicio) {
    return NextResponse.json(
      {
        error: `Ajustar a data-base recalcula todos os períodos${saldoSeraZerado ? " e zera o saldo inicial (ele precisará ser informado de novo)" : ""}. Confirme para continuar.`,
        code: "confirmar_reinicio",
      },
      { status: 409 }
    );
  }

  const agora = new Date().toISOString();
  // Ordem pensada para falhar "para o lado seguro": 1) config com a nova data e saldo pendente (cinza, sem aviso); 2) apaga os períodos antigos;
  // 3) gera os novos. Se algo falhar no meio, o funcionário fica cinza ("Saldo inicial pendente"/"Data-base mudou") e a mesma ação pode ser repetida.
  const { error: erroConfig } = await svc.from("ferias_config").upsert(
    {
      funcionario_id: funcionarioId, data_base_ajustada: ajustada, ajustado_por: user.id, ajustado_em: agora, motivo: d.motivo,
      saldo_inicial_confirmado_em: null, saldo_inicial_confirmado_por: null, saldo_inicial_quitado_ate: null,
    },
    { onConflict: "funcionario_id" }
  );
  if (erroConfig) return respostaDeErro(erroConfig, "gravar a data-base");

  const { error: erroApagar } = await svc.from("ferias_periodos").delete().eq("funcionario_id", funcionarioId);
  if (erroApagar) return respostaDeErro(erroApagar, "apagar períodos antigos");

  const garantido = await garantirPeriodos(svc, funcionario, hoje);
  if ("erroResposta" in garantido) return garantido.erroResposta;

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "ferias_data_base_ajustada",
    entidade: "ferias_config",
    entidade_id: funcionarioId,
    detalhes: {
      funcionario_id: funcionarioId, data_base_antes: baseAtual, data_base_depois: baseNova, data_admissao: funcionario.data_admissao, ajuste_removido: ajustada === null,
      motivo: d.motivo, periodos_apagados: periodos.length, periodos_quitados_apagados: periodosQuitados, saldo_inicial_zerado: saldoSeraZerado,
    },
    unidade_id: funcionario.unidade_id,
  });

  return NextResponse.json({
    data: {
      funcionario_id: funcionarioId, data_base: baseNova, data_base_ajustada: ajustada !== null, saldo_inicial_pendente: garantido.estado.avaliacao.estado === "saldo_pendente",
      estado: garantido.estado.avaliacao.estado,
    },
  });
}
