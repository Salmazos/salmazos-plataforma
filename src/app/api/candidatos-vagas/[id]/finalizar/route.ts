import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

const RESULTADOS_VALIDOS = ["contratado", "reprovado_final"] as const;

function statusAlocacao(tipoServico: string | null): string {
  switch (tipoServico) {
    case "mao_obra_temporaria": return "alocado_mot";
    case "recrutamento_selecao": return "alocado_rs";
    case "terceirizacao": return "alocado_terceirizacao";
    default: return "alocado_rs";
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      resultado, data_inicio, data_fim, renovavel,
      tipo_servico, motivo_reprovacao, responsavel_encerramento, observacoes,
    } = body;

    if (!resultado || !RESULTADOS_VALIDOS.includes(resultado))
      return NextResponse.json({ error: "Resultado inválido." }, { status: 400 });

    const supabase = createServiceClient();

    const { data: cv, error: cvErr } = await supabase
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, vagas(id, titulo, tipo_servico, num_posicoes_abertas, num_posicoes, cliente_id, clientes(nome))")
      .eq("id", id)
      .single();

    if (cvErr || !cv)
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaga = (cv as any).vagas as {
      id: string; titulo: string; tipo_servico: string; num_posicoes_abertas: number | null;
      num_posicoes: number; cliente_id: string | null; clientes: { nome: string } | null;
    } | null;
    const vagaTitulo = vaga?.titulo ?? "vaga";
    const clienteNome = vaga?.clientes?.nome ?? null;
    const tipoServicoFinal = tipo_servico || vaga?.tipo_servico || null;

    if (resultado === "contratado") {
      if (!data_inicio)
        return NextResponse.json({ error: "Data de início é obrigatória." }, { status: 400 });

      // Update candidatos_vagas
      await supabase
        .from("candidatos_vagas")
        .update({
          etapa: "contratado",
          data_inicio,
          data_fim: data_fim || null,
          observacoes: observacoes || null,
        })
        .eq("id", id);

      // Update candidatos allocation
      await supabase
        .from("candidatos")
        .update({
          status_alocacao: statusAlocacao(tipoServicoFinal),
          alocacao_cliente_nome: clienteNome,
          alocacao_vaga_titulo: vagaTitulo,
          alocacao_data_inicio: data_inicio,
          alocacao_data_fim: data_fim || null,
          alocacao_tipo_servico: tipoServicoFinal,
          alocacao_renovavel: tipoServicoFinal === "terceirizacao" ? (renovavel ?? true) : false,
        })
        .eq("id", cv.candidato_id);

      // Decrement positions
      let vagaEncerrada = false;
      if (vaga) {
        const current = vaga.num_posicoes_abertas ?? 1;
        const novas = Math.max(current - 1, 0);
        const updateFields: Record<string, unknown> = { num_posicoes_abertas: novas };
        if (novas === 0) {
          updateFields.status = "fechada";
          vagaEncerrada = true;
        }
        await supabase.from("vagas").update(updateFields).eq("id", vaga.id);
      }

      const dataFmt = data_inicio.split("-").reverse().join("/");
      const dataFimFmt = data_fim ? ` até ${data_fim.split("-").reverse().join("/")}` : "";
      void registrarHistorico({
        candidato_id: cv.candidato_id,
        tipo: "contratado",
        descricao: `Candidato contratado para ${vagaTitulo}${clienteNome ? ` (${clienteNome})` : ""}. Início em ${dataFmt}${dataFimFmt}.${observacoes ? ` Obs: ${observacoes}` : ""}`,
        metadata: { cv_id: id, vaga_id: cv.vaga_id, data_inicio, data_fim, tipo_servico: tipoServicoFinal, observacoes },
      });

      registrarAuditoria({
        acao: "candidato_finalizado",
        entidade: "candidatos_vagas",
        entidade_id: id,
        detalhes: { resultado: "contratado", candidato_id: cv.candidato_id, vaga_id: cv.vaga_id, data_inicio },
      });

      return NextResponse.json({ resultado: "contratado", vaga_encerrada: vagaEncerrada });
    }

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

    await supabase
      .from("candidatos")
      .update({ etapa_kanban: null })
      .eq("id", cv.candidato_id);

    let vagaReaberta = false;
    if (motivo_reprovacao === "Cliente cancelou a vaga" && vaga) {
      await supabase
        .from("vagas")
        .update({ status: "aberta", num_posicoes_abertas: vaga.num_posicoes })
        .eq("id", vaga.id);
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
