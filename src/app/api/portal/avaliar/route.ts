import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";

const STATUS_VALIDOS = ["aprovado", "reprovado"] as const;

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const service = createServiceClient();

    const { data: clienteUsuario } = await service
      .from("cliente_usuarios")
      .select("cliente_id")
      .eq("user_id", user.id)
      .single();

    if (!clienteUsuario)
      return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

    const body = await request.json();
    const { encaminhamento_id, status, feedback_cliente } = body;

    if (!encaminhamento_id || !status || !feedback_cliente?.trim())
      return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });

    if (!STATUS_VALIDOS.includes(status))
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });

    const { data: enc } = await service
      .from("encaminhamentos")
      .select("id, candidato_id, status, vaga_id")
      .eq("id", encaminhamento_id)
      .eq("cliente_id", clienteUsuario.cliente_id)
      .single();

    if (!enc)
      return NextResponse.json({ error: "Encaminhamento não encontrado." }, { status: 404 });

    if (enc.status !== "aguardando")
      return NextResponse.json({ error: "Este encaminhamento já foi avaliado." }, { status: 409 });

    const { data: updated, error } = await service
      .from("encaminhamentos")
      .update({
        status,
        feedback_cliente,
        avaliado_em: new Date().toISOString(),
      })
      .eq("id", encaminhamento_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Sync Kanban principal
    if (status === "aprovado") {
      await service
        .from("candidatos")
        .update({ etapa_kanban: "aprovado_cliente" })
        .eq("id", enc.candidato_id);

      const cvQuery = service
        .from("candidatos_vagas")
        .update({ etapa: "aprovado_cliente" })
        .eq("candidato_id", enc.candidato_id);
      await (enc.vaga_id ? cvQuery.eq("vaga_id", enc.vaga_id) : cvQuery);

      // Save admission data if provided
      const cvId = body.cv_id as string | undefined;
      if (cvId) {
        const admFields: Record<string, unknown> = {};
        const admKeys = [
          "admissao_data_inicio", "admissao_cargo", "admissao_salario",
          "admissao_setor", "admissao_centro_custo", "admissao_horario",
          "admissao_gestor", "admissao_periodo_experiencia", "admissao_observacoes",
          "admissao_funcao", "admissao_salario_hora", "admissao_turno",
          "admissao_tempo_contrato", "admissao_vt", "admissao_exame_responsavel",
          "admissao_local_integracao", "admissao_telefone_candidato",
        ];
        for (const key of admKeys) {
          if (body[key] !== undefined) admFields[key] = body[key];
        }

        // Fee calculation for R&S
        if (body.tipo_servico === "recrutamento_selecao" && body.admissao_salario && enc.vaga_id) {
          const { data: vagaRow } = await service
            .from("vagas")
            .select("fee_rs_percentual, fee_rs_prazo_cobranca")
            .eq("id", enc.vaga_id)
            .single();

          if (vagaRow) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const v = vagaRow as any;
            const pct = v.fee_rs_percentual as number | null;
            if (pct != null) {
              admFields.admissao_fee_percentual = pct;
              admFields.admissao_fee_valor = Number(body.admissao_salario) * pct / 100;
              admFields.admissao_fee_prazo = v.fee_rs_prazo_cobranca ?? null;
            }
            if (body.admissao_data_inicio) {
              const inicio = new Date(body.admissao_data_inicio + "T00:00:00");
              inicio.setDate(inicio.getDate() + 30);
              admFields.garantia_data_fim = inicio.toISOString().split("T")[0];
            }
          }
        }

        if (Object.keys(admFields).length > 0) {
          await service
            .from("candidatos_vagas")
            .update(admFields)
            .eq("id", cvId);
        }
      }
    }

    if (status === "reprovado") {
      await service
        .from("candidatos")
        .update({ etapa_kanban: "reprovado" })
        .eq("id", enc.candidato_id);

      const cvQuery = service
        .from("candidatos_vagas")
        .update({ etapa: "reprovado" })
        .eq("candidato_id", enc.candidato_id);
      await (enc.vaga_id ? cvQuery.eq("vaga_id", enc.vaga_id) : cvQuery);
    }

    void registrarHistorico({
      candidato_id: enc.candidato_id,
      tipo: status === "aprovado" ? "aprovacao_cliente" : "reprovacao_cliente",
      descricao: status === "aprovado"
        ? "Aprovado pelo cliente"
        : "Reprovado pelo cliente",
      metadata: {
        encaminhamento_id,
        cliente_id: clienteUsuario.cliente_id,
        feedback: feedback_cliente,
      },
      criado_por: user.email ?? null,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/portal/avaliar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
