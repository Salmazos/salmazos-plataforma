import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, feriasSituacaoSchema } from "@/lib/schemas";
import { autorizarFerias, carregarFuncionarioElegivel, garantirPeriodos, impedimentoParaAgir, respostaDeErro } from "@/lib/feriasPeriodos";
import { periodoAtual, type PeriodoFerias } from "@/lib/feriasRegras";
import { hojeBrasiliaISO, formatarDataBR } from "@/lib/rescisaoProgramada";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ funcionarioId: string }>;
}

// Mudar a situação do período: em_gozo, gozada ("fecha o período e o funcionário passa ao próximo") ou reabrir (volta para "a programar", com motivo).
//  - em_gozo / gozada: só o período ATUAL (o mais antigo ainda não gozado). Precisam das duas datas de gozo (as já programadas ou as enviadas aqui).
//  - reabrir: só o ÚLTIMO período lançado pelo RH, para a ordem (gozados → programado → a programar) nunca ficar fora de sequência.
//    Período que veio do saldo inicial não se reabre aqui: o saldo inicial é refeito na rota própria.
export async function POST(request: NextRequest, { params }: Params) {
  const { funcionarioId } = await params;
  const auth = await autorizarFerias(funcionarioId);
  if ("erro" in auth) return auth.erro;
  const { user } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(feriasSituacaoSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  const carregado = await carregarFuncionarioElegivel(svc, funcionarioId);
  if ("erro" in carregado) return carregado.erro;
  const hoje = hojeBrasiliaISO();
  const garantido = await garantirPeriodos(svc, carregado.funcionario, hoje);
  if ("erroResposta" in garantido) return garantido.erroResposta;
  const { estado } = garantido;
  const unidade_id = carregado.funcionario.unidade_id;
  const agora = new Date().toISOString();

  const nomeUsuario = async () => resolverNomeUsuario(user.id, user.email ?? null, svc);

  // ── Reabrir ──────────────────────────────────────────────────────────────
  if (d.acao === "reabrir") {
    const alvo = estado.periodos.find((p) => p.id === d.periodo_id);
    if (!alvo) return NextResponse.json({ error: "Período não encontrado." }, { status: 404 });
    if (alvo.situacao === "a_programar") return NextResponse.json({ error: "Este período já está \"a programar\"." }, { status: 409 });
    if (alvo.origem === "saldo_inicial") {
      return NextResponse.json({ error: "Este período foi marcado como já quitado. Refaça as férias já quitadas para alterá-lo." }, { status: 409 });
    }
    const ultimoLancado = [...estado.periodos].filter((p) => p.origem === "gerado" && p.situacao !== "a_programar").sort((a, b) => b.numero - a.numero)[0];
    if (!ultimoLancado || ultimoLancado.id !== alvo.id) {
      return NextResponse.json({ error: "Só o último período lançado pode ser reaberto. Reabra primeiro os mais recentes." }, { status: 409 });
    }
    const { data: atualizado, error } = await svc
      .from("ferias_periodos")
      .update({ situacao: "a_programar", gozo_inicio: null, gozo_fim: null, atualizado_por: user.id, atualizado_em: agora })
      .eq("id", alvo.id)
      .eq("funcionario_id", funcionarioId)
      .eq("situacao", alvo.situacao)
      .select("id")
      .maybeSingle();
    if (error) return respostaDeErro(error, "reabrir");
    if (!atualizado) return NextResponse.json({ error: "A situação deste período mudou. Atualize a tela e tente de novo." }, { status: 409 });
    registrarAuditoria({
      usuario_id: user.id, usuario_nome: await nomeUsuario(), acao: "ferias_reaberta", entidade: "ferias_periodos", entidade_id: alvo.id,
      detalhes: { funcionario_id: funcionarioId, periodo: alvo.numero, situacao_anterior: alvo.situacao, gozo_inicio: alvo.gozo_inicio, gozo_fim: alvo.gozo_fim, motivo: d.motivo },
      unidade_id,
    });
    return NextResponse.json({ data: { id: alvo.id, situacao: "a_programar" } });
  }

  // ── Em gozo / Gozada ─────────────────────────────────────────────────────
  const impedimento = impedimentoParaAgir(estado);
  if (impedimento) return NextResponse.json({ error: impedimento }, { status: 409 });

  const atual: PeriodoFerias | null = periodoAtual(estado.periodos);
  if (!atual || atual.id !== d.periodo_id) {
    return NextResponse.json({ error: "Só o período atual (o mais antigo ainda sem férias tiradas) pode mudar de situação." }, { status: 409 });
  }
  const permitidas = d.acao === "em_gozo" ? ["a_programar", "programada"] : ["a_programar", "programada", "em_gozo"];
  if (!permitidas.includes(atual.situacao)) {
    return NextResponse.json({ error: d.acao === "em_gozo" ? "Este período já está em férias ou com as férias tiradas." : "Este período já está com as férias tiradas." }, { status: 409 });
  }

  const gozoInicio = d.gozo_inicio ?? atual.gozo_inicio;
  const gozoFim = d.gozo_fim ?? atual.gozo_fim;
  if (!gozoInicio || !gozoFim) return NextResponse.json({ error: "Informe as datas inicial e final das férias." }, { status: 400 });
  if (gozoFim < gozoInicio) return NextResponse.json({ error: "A data final não pode ser anterior à data inicial." }, { status: 400 });
  if (gozoInicio <= atual.aquisitivo_fim) {
    return NextResponse.json({ error: `As férias só podem começar depois do fim do período aquisitivo (${formatarDataBR(atual.aquisitivo_fim)}).` }, { status: 400 });
  }
  if (gozoInicio > hoje) return NextResponse.json({ error: "As férias ainda não começaram: a data inicial é futura. Use \"Programar\"." }, { status: 400 });
  if (d.acao === "gozada" && gozoFim > hoje) return NextResponse.json({ error: "As férias ainda não terminaram: a data final é futura." }, { status: 400 });

  const novaSituacao = d.acao === "em_gozo" ? "em_gozo" : "gozada";
  const observacao = d.observacao === undefined ? atual.observacao : d.observacao?.trim() ? d.observacao.trim() : null;
  const { data: atualizado, error } = await svc
    .from("ferias_periodos")
    .update({ situacao: novaSituacao, gozo_inicio: gozoInicio, gozo_fim: gozoFim, observacao, atualizado_por: user.id, atualizado_em: agora })
    .eq("id", atual.id)
    .eq("funcionario_id", funcionarioId)
    .eq("situacao", atual.situacao)
    .select("id")
    .maybeSingle();
  if (error) return respostaDeErro(error, "mudar situação");
  if (!atualizado) return NextResponse.json({ error: "A situação deste período mudou. Atualize a tela e tente de novo." }, { status: 409 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: await nomeUsuario(),
    acao: d.acao === "gozada" ? "ferias_gozada" : "ferias_em_gozo",
    entidade: "ferias_periodos",
    entidade_id: atual.id,
    detalhes: { funcionario_id: funcionarioId, periodo: atual.numero, situacao_anterior: atual.situacao, gozo_inicio: gozoInicio, gozo_fim: gozoFim, observacao },
    unidade_id,
  });

  return NextResponse.json({ data: { id: atual.id, situacao: novaSituacao, gozo_inicio: gozoInicio, gozo_fim: gozoFim } });
}
