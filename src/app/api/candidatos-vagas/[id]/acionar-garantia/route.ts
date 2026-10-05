import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { avisarGarantiaRS } from "@/lib/avisarGarantiaRS";
import { garantiaExpirada } from "@/lib/garantiaRS";
import { sincronizarEncaminhamentoComEtapa } from "@/lib/sincronizarEncaminhamento";
import { exigirAcessoCandidatoVaga } from "@/lib/unidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const bloqueio = await exigirAcessoCandidatoVaga(id);
    if (bloqueio) return bloqueio;
    const supabase = createServiceClient();

    const { data: cv, error: cvErr } = await supabase
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, garantia_data_fim, garantia_acionada, candidatos(nome_completo, responsavel)")
      .eq("id", id)
      .single();

    if (cvErr || !cv)
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

    if (cv.garantia_acionada)
      return NextResponse.json({ error: "Garantia já foi acionada." }, { status: 409 });

    // O prazo vale até o fim do dia do vencimento em horário de Brasília (-03:00), não em UTC.
    const garantiaFim = cv.garantia_data_fim as string | null;
    if (garantiaExpirada(garantiaFim))
      return NextResponse.json({ error: "Garantia já expirou." }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidatoNome = (cv as any).candidatos?.nome_completo ?? "Candidato";

    // Mark guarantee as used. Guarda contra clique duplo: só marca se ainda não estava acionada; quem perde a
    // corrida recebe o mesmo 409, antes de criar vaga de reposição, histórico ou aviso.
    const { data: marcada, error: erroMarcar } = await supabase
      .from("candidatos_vagas")
      .update({
        garantia_acionada: true,
        garantia_acionada_em: new Date().toISOString(),
        etapa: "reprovado_final",
      })
      .eq("id", id)
      .eq("garantia_acionada", false)
      .select("id");
    if (erroMarcar) {
      console.error(`[acionar-garantia] Erro ao marcar a garantia como acionada (cv_id=${id}):`, erroMarcar.message);
      return NextResponse.json({ error: "Erro interno." }, { status: 500 });
    }
    if (!marcada || marcada.length === 0)
      return NextResponse.json({ error: "Garantia já foi acionada." }, { status: 409 });

    // Fetch original vaga to duplicate
    const { data: vagaOriginal } = await supabase
      .from("vagas")
      .select("*, clientes(nome)")
      .eq("id", cv.vaga_id)
      .single();

    let novaVagaId: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vo = vagaOriginal as any;
    const clienteNome = vo?.clientes?.nome ?? "Cliente";

    void sincronizarEncaminhamentoComEtapa(cv.candidato_id, vo?.cliente_id ?? null, "reprovado_final", supabase);

    if (vo) {
      const obsReposicao = `Reposição gratuita — candidato anterior: ${candidatoNome}${vo.observacoes ? ` | ${vo.observacoes}` : ""}`;
      const { data: novaVaga } = await supabase
        .from("vagas")
        .insert({
          titulo: vo.titulo,
          cliente_id: vo.cliente_id,
          tipo_servico: vo.tipo_servico,
          num_posicoes: vo.num_posicoes,
          num_posicoes_abertas: vo.num_posicoes,
          prazo: null,
          status: "aberta",
          cidade: vo.cidade,
          estado: vo.estado,
          salario: vo.salario,
          requisitos: vo.requisitos,
          beneficios: vo.beneficios,
          principais_atividades: vo.principais_atividades,
          horario: vo.horario,
          habilidades_desejadas: vo.habilidades_desejadas ?? [],
          responsavel: vo.responsavel,
          observacoes: obsReposicao,
          fee_rs_percentual: vo.fee_rs_percentual,
          fee_rs_prazo_cobranca: vo.fee_rs_prazo_cobranca,
          reposicao_de_candidato_vaga_id: cv.id,
          // Reposição é da mesma unidade da vaga original (mesmo cliente, mesma operação) —
          // explícito, não o DEFAULT do banco.
          unidade_id: vo.unidade_id,
        })
        .select("id")
        .single();
      novaVagaId = novaVaga?.id ?? null;
    }

    // Reset candidate allocation
    await supabase
      .from("candidatos")
      .update({ etapa_kanban: null, status_alocacao: "disponivel", alocacao_cliente_nome: null, alocacao_vaga_titulo: null, alocacao_data_inicio: null, alocacao_data_fim: null, alocacao_tipo_servico: null, alocacao_renovavel: false })
      .eq("id", cv.candidato_id);

    void registrarHistorico({
      candidato_id: cv.candidato_id,
      tipo: "reprovado_final",
      descricao: `Garantia R&S acionada. Reposição gratuita iniciada.${novaVagaId ? ` Nova vaga criada.` : ""}`,
      metadata: { cv_id: id, vaga_id: cv.vaga_id, nova_vaga_id: novaVagaId },
    });

    // Sino, popup e e-mail seguem Configurações > Avisos (evento garantia_rs_acionada). Nunca lança: a garantia já
    // foi acionada e a vaga de reposição já existe.
    try {
      const resultadoAviso = await avisarGarantiaRS(supabase, {
        evento: "acionada",
        candidatoId: cv.candidato_id,
        vagaId: cv.vaga_id,
        candidatoNome,
        vagaTitulo: vo?.titulo ?? null,
        clienteNome,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responsavelNome: (cv as any).candidatos?.responsavel ?? null,
        unidadeId: vo?.unidade_id ?? null,
        novaVagaId,
      });
      if (resultadoAviso.sino === "falhou" || resultadoAviso.email === "falhou") {
        console.error(`[acionar-garantia] Aviso não entregue em algum canal (cv_id=${id}): sino=${resultadoAviso.sino}, e-mail=${resultadoAviso.email}.`);
      }
    } catch (avisoErr) {
      console.error(`[acionar-garantia] Erro ao avisar (cv_id=${id}):`, avisoErr);
    }

    return NextResponse.json({ success: true, nova_vaga_id: novaVagaId });
  } catch (err) {
    console.error("[PATCH /api/candidatos-vagas/[id]/acionar-garantia]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
