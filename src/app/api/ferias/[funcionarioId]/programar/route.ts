import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, feriasProgramarSchema } from "@/lib/schemas";
import { autorizarFerias, carregarFuncionarioElegivel, garantirPeriodos, impedimentoParaAgir, respostaDeErro } from "@/lib/feriasPeriodos";
import { periodoAtual } from "@/lib/feriasRegras";
import { hojeBrasiliaISO, formatarDataBR } from "@/lib/rescisaoProgramada";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

// Programar = registrar as datas de gozo combinadas com a contabilidade: "a programar" (ou "programada", para trocar as datas) → "programada".
// Só o período atual (o mais antigo ainda não gozado). A contabilidade faz os cálculos; aqui só valem janelas de data simples:
//  início de hoje em diante, depois do fim do aquisitivo e até a data-limite (programar depois dela esconderia o risco de pagamento em dobro).
// Ao programar, os registros dos avisos de 90/60/30 são zerados: os avisos só voltam se a data de início passar sem a situação mudar.
export async function POST(request: NextRequest, { params }: Params) {
  const { funcionarioId } = await params;
  const auth = await autorizarFerias(funcionarioId);
  if ("erro" in auth) return auth.erro;
  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(feriasProgramarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  const carregado = await carregarFuncionarioElegivel(svc, funcionarioId);
  if ("erro" in carregado) return carregado.erro;
  const hoje = hojeBrasiliaISO();
  const garantido = await garantirPeriodos(svc, carregado.funcionario, hoje);
  if ("erroResposta" in garantido) return garantido.erroResposta;
  const { estado } = garantido;

  const impedimento = impedimentoParaAgir(estado);
  if (impedimento) return NextResponse.json({ error: impedimento }, { status: 409 });

  const atual = periodoAtual(estado.periodos);
  if (!atual || atual.id !== d.periodo_id) {
    return NextResponse.json({ error: "Só o período atual (o mais antigo ainda não gozado) pode ser programado." }, { status: 409 });
  }
  if (atual.situacao !== "a_programar" && atual.situacao !== "programada") {
    return NextResponse.json({ error: "Este período já está em gozo ou gozado." }, { status: 409 });
  }
  if (d.gozo_fim < d.gozo_inicio) return NextResponse.json({ error: "A data final não pode ser anterior à data inicial." }, { status: 400 });
  if (d.gozo_inicio < hoje) return NextResponse.json({ error: "A data inicial não pode ser anterior a hoje." }, { status: 400 });
  if (d.gozo_inicio <= atual.aquisitivo_fim) {
    return NextResponse.json({ error: `As férias só podem começar depois do fim do período aquisitivo (${formatarDataBR(atual.aquisitivo_fim)}).` }, { status: 400 });
  }
  if (d.gozo_inicio > atual.data_limite) {
    return NextResponse.json(
      { error: `A data inicial passa da data-limite (${formatarDataBR(atual.data_limite)}). Para registrar férias já em andamento ou concluídas, use "Em gozo" ou "Gozada".` },
      { status: 400 }
    );
  }

  const observacao = d.observacao?.trim() ? d.observacao.trim() : null;
  const reprogramacao = atual.situacao === "programada";
  // Troca atômica: só atualiza se o período continua "a programar"/"programada" (dois cliques ou duas pessoas ao mesmo tempo não se atropelam).
  const { data: atualizado, error } = await svc
    .from("ferias_periodos")
    .update({
      situacao: "programada", gozo_inicio: d.gozo_inicio, gozo_fim: d.gozo_fim, observacao,
      aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, atualizado_por: user.id, atualizado_em: new Date().toISOString(),
    })
    .eq("id", atual.id)
    .eq("funcionario_id", funcionarioId)
    .in("situacao", ["a_programar", "programada"])
    .select("id")
    .maybeSingle();
  if (error) return respostaDeErro(error, "programar");
  if (!atualizado) return NextResponse.json({ error: "A situação deste período mudou. Atualize a tela e tente de novo." }, { status: 409 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc),
    acao: "ferias_programada",
    entidade: "ferias_periodos",
    entidade_id: atual.id,
    detalhes: {
      funcionario_id: funcionarioId, periodo: atual.numero, gozo_inicio: d.gozo_inicio, gozo_fim: d.gozo_fim, observacao, reprogramacao,
      ...(reprogramacao ? { anterior: { gozo_inicio: atual.gozo_inicio, gozo_fim: atual.gozo_fim } } : {}),
    },
    unidade_id: carregado.funcionario.unidade_id,
  });

  return NextResponse.json({ data: { id: atual.id, situacao: "programada", gozo_inicio: d.gozo_inicio, gozo_fim: d.gozo_fim } });
}
