import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, candidatoVagaFinalizarSchema } from "@/lib/schemas";
import { finalizarContratado } from "@/lib/finalizarContratacao";
import { sincronizarEncaminhamentoComEtapa } from "@/lib/sincronizarEncaminhamento";
import { sincronizarPosicoesAbertas } from "@/lib/vagaPosicoes";
import { checarAcessoCandidatoVaga } from "@/lib/unidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = parseBody(candidatoVagaFinalizarSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const {
      resultado, data_inicio, data_fim, renovavel,
      motivo_reprovacao, responsavel_encerramento, observacoes,
      vaga_cancelada_cliente, admissao_salario, fee_ausente_justificativa,
      gerar_cobranca_rs,
    } = parsed.data;

    const supabase = createServiceClient();

    // Autenticação — só usada pra atribuir a autoria da cobrança R&S (cobrancas_rs.
    // gerado_por_user_id), que decide quem além do acesso amplo pode revisar essa
    // pendência específica depois (ver podeRevisarCobranca). Nunca bloqueia a
    // finalização em si por falta de user — se por algum motivo não resolver, a
    // cobrança simplesmente nasce sem "dono" e só quem tem acesso amplo revisa.
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    // Trava de unidade só quando há usuário — mantém a regra acima de nunca bloquear a
    // finalização por falta de sessão resolvida.
    if (user) {
      const bloqueio = await checarAcessoCandidatoVaga(user, id);
      if (bloqueio) return bloqueio;
    }

    if (resultado === "contratado") {
      // Regra de contratação compartilhada com a aprovação de indicação direta (ver finalizarContratacao.ts).
      const r = await finalizarContratado(supabase, {
        cvId: id, data_inicio, data_fim, renovavel, observacoes, admissao_salario,
        fee_ausente_justificativa, gerar_cobranca_rs, userId: user?.id ?? null,
      });
      if (!r.ok) return NextResponse.json({ error: r.error, ...r.extra }, { status: r.status });
      return NextResponse.json({ resultado: "contratado", vaga_encerrada: r.vagaEncerrada, cobranca_rs_id: r.cobrancaRsId });
    }

    const { data: cv, error: cvErr } = await supabase
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, admissao_fee_valor, vagas!candidatos_vagas_vaga_id_fkey(id, titulo, status, tipo_servico, num_posicoes, cliente_id, fee_rs_percentual, fee_rs_prazo_cobranca, clientes(nome))")
      .eq("id", id)
      .single();

    if (cvErr || !cv)
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaga = (cv as any).vagas as {
      id: string; titulo: string; status: string; tipo_servico: string;
      num_posicoes: number; cliente_id: string | null; clientes: { nome: string } | null;
      fee_rs_percentual: number | null; fee_rs_prazo_cobranca: string | null;
    } | null;
    const vagaTitulo = vaga?.titulo ?? "vaga";
    const clienteNome = vaga?.clientes?.nome ?? null;
    // reprovado_final
    if (!motivo_reprovacao)
      return NextResponse.json({ error: "Motivo do encerramento é obrigatório." }, { status: 400 });
    if (!responsavel_encerramento)
      return NextResponse.json({ error: "Responsável pelo encerramento é obrigatório." }, { status: 400 });

    await supabase
      .from("candidatos_vagas")
      .update({
        etapa: "reprovado_final",
        motivo_reprovacao,
        responsavel_encerramento,
        observacoes: observacoes || null,
      })
      .eq("id", id);

    void sincronizarEncaminhamentoComEtapa(cv.candidato_id, vaga?.cliente_id ?? null, "reprovado_final", supabase);

    await supabase
      .from("candidatos")
      .update({ etapa_kanban: null })
      .eq("id", cv.candidato_id);

    let vagaReaberta = false;
    if (vaga_cancelada_cliente && vaga) {
      await supabase
        .from("vagas")
        .update({ status: "aberta" })
        .eq("id", vaga.id);
      // Recalcula a partir da contagem real de contratados, em vez de resetar pro total —
      // essa vaga pode já ter outras posições preenchidas além dessa que acabou de ser
      // reprovada (ver vagaPosicoes.ts). MOT reaberta por cancelamento do cliente também não
      // pode fechar sozinha na mesma chamada — mesmo caso da reativação manual.
      await sincronizarPosicoesAbertas(vaga.id, supabase, {
        permitirFechamentoAutomatico: vaga.tipo_servico !== "mao_obra_temporaria",
      });
      vagaReaberta = true;
      void registrarHistorico({
        candidato_id: cv.candidato_id,
        tipo: "etapa_alterada",
        descricao: `Vaga reaberta — cliente cancelou o processo para ${vagaTitulo}`,
        metadata: { vaga_id: cv.vaga_id },
      });
    }

    void registrarHistorico({
      candidato_id: cv.candidato_id,
      tipo: "reprovado_final",
      descricao: `Processo encerrado para ${vagaTitulo}. Motivo: ${motivo_reprovacao}. Responsável: ${responsavel_encerramento}.${observacoes ? ` ${observacoes}` : ""}`,
      metadata: { cv_id: id, vaga_id: cv.vaga_id, motivo_reprovacao, responsavel_encerramento, observacoes },
    });

    registrarAuditoria({
      acao: "candidato_finalizado",
      entidade: "candidatos_vagas",
      entidade_id: id,
      detalhes: { resultado: "reprovado_final", candidato_id: cv.candidato_id, vaga_id: cv.vaga_id, motivo_reprovacao },
    });

    return NextResponse.json({ resultado: "reprovado_final", vaga_reaberta: vagaReaberta });
  } catch (err) {
    console.error("[PATCH /api/candidatos-vagas/[id]/finalizar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
