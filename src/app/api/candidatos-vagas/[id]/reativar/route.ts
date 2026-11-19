import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { parseBody, candidatoVagaReativarSchema } from "@/lib/schemas";
import { checarAcessoCandidatoVaga, resolverUnidadeUsuario } from "@/lib/unidadeAuth";
import { ehEtapaReativavel, getEtapaLabel } from "@/lib/etapasCandidatura";

interface Params {
  params: Promise<{ id: string }>;
}

// Mesmo critério do alerta do Banco de Candidatos (GET /api/candidatos/[id]/processos-ativos).
const ETAPAS_ATIVAS = ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"];

// Candidata que saiu do processo (Não tem interesse / Não compareceu) e mudou de ideia: o MESMO vínculo volta para Triagem ou Entrevista Salmazos.
// Sem vínculo duplicado (índice único vaga+candidato) e sem tocar no encaminhamento nem enviar e-mail/aviso: levar ao cliente continua sendo o
// "Encaminhar ao cliente", que já reaproveita o encaminhamento. Permissão: a mesma de mover cartão (acesso à vaga da candidatura).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const bloqueio = await checarAcessoCandidatoVaga(user, id);
    if (bloqueio) return bloqueio;

    const parsed = parseBody(candidatoVagaReativarSchema, await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { destino } = parsed.data;

    const svc = createServiceClient();

    const { data: cv } = await svc
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, etapa, motivo_reprovacao, data_entrevista_salmazos")
      .eq("id", id)
      .maybeSingle();
    if (!cv) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

    // Idempotência: quem clica duas vezes (ou abre a tela desatualizada) cai aqui no 2º pedido.
    if (!ehEtapaReativavel(cv.etapa)) {
      const rotulo = getEtapaLabel(cv.etapa);
      return NextResponse.json({ error: `Esta candidatura está em ${rotulo} e não pode ser reativada por aqui. Atualize a página.`, etapa: cv.etapa }, { status: 409 });
    }
    const etapaAnterior = cv.etapa as string;

    const { data: vaga } = await svc.from("vagas").select("id, titulo, status, unidade_id").eq("id", cv.vaga_id).maybeSingle();
    if (!vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
    if (vaga.status === "pausada") {
      return NextResponse.json({ error: "A vaga está pausada. Reabra a vaga antes de reativar a candidata." }, { status: 409 });
    }
    if (vaga.status !== "aberta") {
      return NextResponse.json({ error: "A vaga está encerrada. Reabra a vaga antes de reativar a candidata." }, { status: 409 });
    }

    const { data: candidato } = await svc.from("candidatos").select("id, nome_completo, bloqueado").eq("id", cv.candidato_id).maybeSingle();
    if (!candidato) return NextResponse.json({ error: "Candidato não encontrado." }, { status: 404 });
    if (candidato.bloqueado === true) {
      return NextResponse.json({ error: "Este candidato está bloqueado e não pode ser reativado." }, { status: 409 });
    }

    // Atualização condicional à etapa lida: se outra pessoa mexeu no meio, nenhuma linha muda. updated_at é gravado de propósito (o PATCH de etapa
    // não o atualiza, e o SLA mede o tempo na etapa por ele: sem isso a reativada já nasceria com o prazo estourado). O motivo antigo sai do
    // vínculo e fica no histórico. match_score, observações e data_entrevista_salmazos não são tocados.
    const agora = new Date().toISOString();
    const { data: atualizada, error: updateErr } = await svc
      .from("candidatos_vagas")
      .update({ etapa: destino, motivo_reprovacao: null, updated_at: agora })
      .eq("id", id)
      .eq("etapa", etapaAnterior)
      .select("id")
      .maybeSingle();
    if (updateErr) {
      console.error(`[reativar] Falha ao reativar (cv_id=${id}):`, updateErr.message);
      return NextResponse.json({ error: "Não foi possível reativar a candidata. Nada foi alterado; tente novamente." }, { status: 500 });
    }
    if (!atualizada) {
      return NextResponse.json({ error: "Esta candidatura já foi alterada por outra pessoa. Atualize a página." }, { status: 409 });
    }

    // Só avisa (não bloqueia): outro processo ativo da candidata em outra vaga, no escopo de unidade de quem reativa.
    const avisos: { outros_processos: { vaga_titulo: string; etapa: string; responsavel: string | null }[] } = { outros_processos: [] };
    try {
      const ctx = await resolverUnidadeUsuario(user);
      let q = svc
        .from("candidatos_vagas")
        .select("id, etapa, responsavel, vagas!candidatos_vagas_vaga_id_fkey!inner(titulo, unidade_id)")
        .eq("candidato_id", cv.candidato_id)
        .neq("id", id)
        .in("etapa", ETAPAS_ATIVAS);
      if (ctx && !ctx.todasUnidades) q = q.eq("vagas.unidade_id", ctx.unidadeId);
      const { data: outros } = await q;
      for (const o of outros ?? []) {
        const v = o.vagas as unknown as { titulo: string } | null;
        avisos.outros_processos.push({ vaga_titulo: v?.titulo ?? "—", etapa: o.etapa as string, responsavel: (o.responsavel as string | null) ?? null });
      }
    } catch (err) {
      console.error(`[reativar] Não foi possível checar outros processos (cv_id=${id}):`, err instanceof Error ? err.message : err);
    }

    // Histórico COM autor. É esperado (await), e não fire-and-forget, para o registro existir quando a resposta sai; a função nunca lança.
    await registrarHistorico({
      candidato_id: cv.candidato_id,
      tipo: "etapa_alterada",
      descricao: `Reativada: ${getEtapaLabel(etapaAnterior)} → ${getEtapaLabel(destino)} (vaga ${vaga.titulo})`,
      metadata: {
        cv_id: id,
        vaga_id: cv.vaga_id,
        etapa_anterior: etapaAnterior,
        etapa_nova: destino,
        reativado: true,
        motivo_reprovacao_anterior: cv.motivo_reprovacao ?? null,
        // A data NÃO é apagada (decisão do Ölver): fica no vínculo e aqui, só quando existe, para quem revisar o histórico.
        ...(cv.data_entrevista_salmazos ? { data_entrevista_salmazos_anterior: cv.data_entrevista_salmazos } : {}),
      },
      criado_por: user.email ?? null,
    });

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, svc).catch(() => user.email ?? null),
      acao: "candidatura_reativada",
      entidade: "candidatos_vagas",
      entidade_id: id,
      unidade_id: vaga.unidade_id ?? null,
      detalhes: { candidato_id: cv.candidato_id, vaga_id: cv.vaga_id, etapa_anterior: etapaAnterior, etapa_nova: destino, motivo_reprovacao_anterior: cv.motivo_reprovacao ?? null },
    });

    return NextResponse.json({ data: { id, etapa: destino }, etapa_anterior: etapaAnterior, avisos });
  } catch (err) {
    console.error("[POST /api/candidatos-vagas/[id]/reativar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
