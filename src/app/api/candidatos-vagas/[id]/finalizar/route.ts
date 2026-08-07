import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { registrarAuditoria } from "@/lib/audit";
import { parseBody, candidatoVagaFinalizarSchema } from "@/lib/schemas";
import { gerarCobrancasRSParaVaga } from "@/lib/cobrancaRS";

interface Params {
  params: Promise<{ id: string }>;
}

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
    const parsed = parseBody(candidatoVagaFinalizarSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const {
      resultado, data_inicio, data_fim, renovavel,
      tipo_servico, motivo_reprovacao, responsavel_encerramento, observacoes,
      vaga_cancelada_cliente, admissao_salario, fee_ausente_justificativa,
    } = parsed.data;

    const supabase = createServiceClient();

    const { data: cv, error: cvErr } = await supabase
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, admissao_fee_valor, vagas(id, titulo, tipo_servico, num_posicoes_abertas, num_posicoes, cliente_id, fee_rs_percentual, fee_rs_prazo_cobranca, clientes(nome))")
      .eq("id", id)
      .single();

    if (cvErr || !cv)
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vaga = (cv as any).vagas as {
      id: string; titulo: string; tipo_servico: string; num_posicoes_abertas: number | null;
      num_posicoes: number; cliente_id: string | null; clientes: { nome: string } | null;
      fee_rs_percentual: number | null; fee_rs_prazo_cobranca: string | null;
    } | null;
    const vagaTitulo = vaga?.titulo ?? "vaga";
    const clienteNome = vaga?.clientes?.nome ?? null;
    const tipoServicoFinal = tipo_servico || vaga?.tipo_servico || null;

    if (resultado === "contratado") {
      if (!data_inicio)
        return NextResponse.json({ error: "Data de início é obrigatória." }, { status: 400 });

      const cvFields: Record<string, unknown> = {
        etapa: "contratado",
        data_inicio,
        data_fim: data_fim || null,
        observacoes: observacoes || null,
      };

      // Fee R&S — mesma regra de portal/avaliar/route.ts, mas com proteção contra
      // sobrescrita: essa rota pode ser chamada depois de o cliente já ter aprovado
      // (e lançado o fee) pelo portal dele, então só grava se ainda não existir nada.
      const feeRsPercentual = vaga?.fee_rs_percentual ?? null;

      // Trava preventiva: vaga R&S sem taxa configurada não pode ser finalizada em
      // silêncio (já aconteceu 2x de passar batido, sem fee lançado e sem ninguém
      // perceber). Só bloqueia quando o fee ainda não foi lançado por nenhum caminho
      // (aqui ou pelo portal do cliente) — senão travaria reprocessamentos legítimos.
      // O frontend (ModalFinalizarProcesso) já resolve isso antes de chegar aqui —
      // essa checagem é o backstop server-side pra chamada direta à API não pular
      // a trava.
      const precisaFeeSemTaxaConfigurada =
        tipoServicoFinal === "recrutamento_selecao" &&
        feeRsPercentual == null &&
        cv.admissao_fee_valor == null;

      if (precisaFeeSemTaxaConfigurada && !fee_ausente_justificativa?.trim()) {
        return NextResponse.json(
          {
            error: "Esta vaga é de Recrutamento e Seleção mas não tem taxa (%) configurada. Configure a taxa da vaga ou informe uma justificativa para continuar sem ela.",
            requiresFeeJustificativa: true,
          },
          { status: 400 }
        );
      }

      if (
        tipoServicoFinal === "recrutamento_selecao" &&
        admissao_salario != null &&
        cv.admissao_fee_valor == null &&
        feeRsPercentual != null
      ) {
        cvFields.admissao_fee_percentual = feeRsPercentual;
        cvFields.admissao_fee_valor = admissao_salario * feeRsPercentual / 100;
        cvFields.admissao_fee_prazo = vaga?.fee_rs_prazo_cobranca ?? null;
        cvFields.admissao_fee_origem = "analista_interno";

        const inicioGarantia = new Date(data_inicio + "T00:00:00");
        inicioGarantia.setDate(inicioGarantia.getDate() + 30);
        cvFields.garantia_data_fim = inicioGarantia.toISOString().split("T")[0];
      }

      await supabase
        .from("candidatos_vagas")
        .update(cvFields)
        .eq("id", id);

      if (precisaFeeSemTaxaConfigurada) {
        registrarAuditoria({
          acao: "admissao_finalizada_sem_fee_rs",
          entidade: "candidatos_vagas",
          entidade_id: id,
          detalhes: {
            candidato_id: cv.candidato_id,
            vaga_id: cv.vaga_id,
            vaga_titulo: vagaTitulo,
            justificativa: fee_ausente_justificativa!.trim(),
          },
        });
      }

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

        if (vagaEncerrada) {
          await gerarCobrancasRSParaVaga(vaga.id, supabase).catch((err) =>
            console.error("[finalizar] Erro ao gerar cobranças R&S:", err)
          );
        }
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
    if (vaga_cancelada_cliente && vaga) {
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
