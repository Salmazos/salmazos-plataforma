import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: cv, error: cvErr } = await supabase
      .from("candidatos_vagas")
      .select("id, candidato_id, vaga_id, garantia_data_fim, garantia_acionada, candidatos(nome_completo)")
      .eq("id", id)
      .single();

    if (cvErr || !cv)
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

    if (cv.garantia_acionada)
      return NextResponse.json({ error: "Garantia já foi acionada." }, { status: 409 });

    const garantiaFim = cv.garantia_data_fim as string | null;
    if (garantiaFim) {
      const fimDate = new Date(garantiaFim + "T23:59:59");
      if (fimDate < new Date())
        return NextResponse.json({ error: "Garantia já expirou." }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidatoNome = (cv as any).candidatos?.nome_completo ?? "Candidato";

    // Mark guarantee as used
    await supabase
      .from("candidatos_vagas")
      .update({
        garantia_acionada: true,
        garantia_acionada_em: new Date().toISOString(),
        etapa: "reprovado_final",
      })
      .eq("id", id);

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
          horario: vo.horario,
          habilidades_desejadas: vo.habilidades_desejadas ?? [],
          responsavel: vo.responsavel,
          observacoes: obsReposicao,
          fee_rs_percentual: vo.fee_rs_percentual,
          fee_rs_prazo_cobranca: vo.fee_rs_prazo_cobranca,
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

    const vagaTitulo = vo?.titulo ?? "Vaga";
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">🔄 Garantia R&S Acionada</h1>
  </div>
  <div style="padding:24px 28px">
    <div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0;color:#C2410C;font-size:14px;font-weight:700">Reposição gratuita iniciada</p>
      <p style="margin:4px 0 0;color:#C2410C;font-size:13px">Uma nova vaga foi criada automaticamente.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Candidato anterior</td><td style="padding:6px 0;color:#111827">${candidatoNome}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Vaga original</td><td style="padding:6px 0;color:#111827">${vagaTitulo}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Cliente</td><td style="padding:6px 0;color:#111827">${clienteNome}</td></tr>
      <tr><td style="padding:6px 0;color:#6B7280;font-weight:600">Data acionamento</td><td style="padding:6px 0;color:#111827">${new Date().toLocaleDateString("pt-BR")}</td></tr>
    </table>
    ${novaVagaId ? `<div style="text-align:center"><a href="https://salmazos-plataforma.vercel.app/painel/vagas/${novaVagaId}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver nova vaga</a></div>` : ""}
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Notificação automática</p>
  </div>
</div>
</body></html>`;

    const resultadoNotify = await notifyAllAnalysts({
      subject: `🔄 Garantia R&S Acionada — ${candidatoNome} — ${clienteNome}`,
      html,
      tipo: "garantia_acionada",
      candidato_id: cv.candidato_id,
      vaga_id: cv.vaga_id,
    });

    if (resultadoNotify.attempted === 0) {
      console.error(
        `[acionar-garantia] Notificação por e-mail NÃO enviada — nenhuma tentativa registrada (cv_id=${id}).`
      );
    }

    // Create bell notification
    const { error: errInsertNotificacao } = await supabase.from("notificacoes_analista").insert({
      tipo: "garantia_acionada",
      titulo: `🔄 Garantia acionada: ${candidatoNome}`,
      mensagem: `Reposição gratuita iniciada para ${vo?.titulo ?? "vaga"} (${clienteNome}). Nova vaga aberta.`,
      candidato_id: cv.candidato_id,
    });

    if (errInsertNotificacao) {
      console.error(
        `[acionar-garantia] Erro ao registrar notificação de sino (cv_id=${id}):`,
        errInsertNotificacao.message
      );
    }

    return NextResponse.json({ success: true, nova_vaga_id: novaVagaId });
  } catch (err) {
    console.error("[PATCH /api/candidatos-vagas/[id]/acionar-garantia]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
