import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { sendEmail } from "@/lib/sendEmail";
import { parseBody, portalAvaliarSchema } from "@/lib/schemas";

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createPortalClient();
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
    const parsed = parseBody(portalAvaliarSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { encaminhamento_id, status, feedback_cliente } = parsed.data;

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
          "admissao_data_inicio", "admissao_salario",
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

    // Send approval notification email to Salmazos
    if (status === "aprovado") {
      try {
        const [{ data: cand }, { data: cli }, vagaData] = await Promise.all([
          service.from("candidatos").select("nome_completo, cargo_pretendido, cidade, estado").eq("id", enc.candidato_id).single(),
          service.from("clientes").select("nome").eq("id", clienteUsuario.cliente_id).single(),
          enc.vaga_id
            ? service.from("vagas").select("titulo, tipo_servico, fee_rs_percentual, fee_rs_prazo_cobranca").eq("id", enc.vaga_id).single()
            : Promise.resolve({ data: null }),
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = cand as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = vagaData.data as any;
        const candidatoNome = c?.nome_completo ?? "Candidato";
        const clienteNome = cli?.nome ?? "Cliente";

        const tipoLabel: Record<string, string> = {
          recrutamento_selecao: "Recrutamento e Seleção",
          mao_obra_temporaria: "Mão de Obra Temporária",
          terceirizacao: "Terceirização",
          avaliacao_psicologica: "Avaliação Psicológica",
        };

        const admLabels: Record<string, string> = {
          admissao_data_inicio: "Data de Início",
          admissao_setor: "Setor",
          admissao_centro_custo: "Centro de Custo",
          admissao_horario: "Horário",
          admissao_gestor: "Gestor Direto",
          admissao_periodo_experiencia: "Período de Experiência",
          admissao_funcao: "Função",
          admissao_turno: "Turno",
          admissao_tempo_contrato: "Tempo de Contrato",
          admissao_vt: "Vale Transporte",
          admissao_exame_responsavel: "Exame Admissional",
          admissao_local_integracao: "Local/Data Integração",
          admissao_telefone_candidato: "Telefone do Candidato",
          admissao_observacoes: "Observações",
        };

        const linhaTabela = (label: string, display: string) =>
          `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${label}</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${display}</td></tr>`;

        let admRows = "";

        // Salário tem rótulo dedicado (em vez do loop genérico abaixo) porque MOT
        // pode ser Horista OU Mensalista — sem deixar isso explícito, quem lê o
        // e-mail (usado pra passar os dados pra contabilidade) não sabe qual dos
        // dois valores é o real nem em que unidade ele está.
        if (body.admissao_salario_hora != null && body.admissao_salario_hora !== "") {
          const valorHora = Number(body.admissao_salario_hora).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
          admRows += linhaTabela("Salário", `R$ ${valorHora}/hora (Horista)`);
        } else if (body.admissao_salario != null && body.admissao_salario !== "") {
          const valorMensal = Number(body.admissao_salario).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
          const sufixo = body.tipo_servico === "mao_obra_temporaria" ? " (Mensalista)" : "";
          admRows += linhaTabela("Salário", `R$ ${valorMensal}/mês${sufixo}`);
        }

        for (const [key, label] of Object.entries(admLabels)) {
          const val = body[key];
          if (val != null && val !== "" && val !== false) {
            const display = typeof val === "boolean" ? (val ? "Sim" : "Não")
              : typeof val === "number" ? val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
              : key === "admissao_data_inicio" ? String(val).split("-").reverse().join("/")
              : String(val);
            admRows += linhaTabela(label, display);
          }
        }

        let feeSection = "";
        if (body.tipo_servico === "recrutamento_selecao" && v?.fee_rs_percentual && body.admissao_salario) {
          const pct = Number(v.fee_rs_percentual);
          const feeVal = Number(body.admissao_salario) * pct / 100;
          const garantiaFim = body.admissao_data_inicio
            ? (() => { const d = new Date(body.admissao_data_inicio + "T00:00:00"); d.setDate(d.getDate() + 30); return d.toLocaleDateString("pt-BR"); })()
            : "—";
          feeSection = `
            <div style="margin:20px 0;padding:16px;background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px">
              <p style="margin:0 0 4px;font-weight:700;color:#92400E;font-size:14px">Informações Financeiras</p>
              <p style="margin:0;color:#92400E;font-size:13px;line-height:1.7">
                <strong>Fee:</strong> ${pct}% = R$ ${feeVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}<br>
                <strong>Prazo de cobrança:</strong> ${v.fee_rs_prazo_cobranca ?? "A definir"}<br>
                <strong>Garantia de reposição:</strong> até ${garantiaFim}
              </p>
            </div>`;
        }

        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">✅ Candidato Aprovado pelo Cliente</h1>
  </div>
  <div style="padding:28px 32px">
    <div style="margin-bottom:20px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Candidato</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${candidatoNome}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${c?.cargo_pretendido ?? "—"} · ${c?.cidade ?? ""}${c?.estado ? ` – ${c.estado}` : ""}</p>
    </div>
    <div style="margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:8px">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Vaga</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#111827">${v?.titulo ?? "—"}</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6B7280">${clienteNome} · ${tipoLabel[v?.tipo_servico] ?? v?.tipo_servico ?? "—"}</p>
    </div>
    ${admRows ? `
    <div style="margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">📋 Dados para Admissão</p>
      <table style="width:100%;border-collapse:collapse">${admRows}</table>
    </div>` : ""}
    ${feeSection}
    <div style="margin-bottom:20px;padding:12px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.07em">💬 Feedback do Cliente</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">${feedback_cliente}</p>
    </div>
    <div style="text-align:center;padding-top:16px;border-top:1px solid #f3f4f6">
      <a href="https://salmazos-plataforma.vercel.app/painel/candidato/${enc.candidato_id}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil completo</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;

        await sendEmail({
          to: "olver@salmazos.com.br",
          subject: `✅ Aprovação de Candidato — ${candidatoNome} — ${clienteNome}`,
          html,
          tipo: "aprovacao_cliente",
          candidato_id: enc.candidato_id,
          vaga_id: enc.vaga_id ?? undefined,
        });
      } catch (emailErr) {
        console.error("[avaliar] Erro ao enviar email de notificação:", emailErr);
      }
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/portal/avaliar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
