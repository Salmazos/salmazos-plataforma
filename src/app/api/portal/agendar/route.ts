import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { notifyResponsibleOrAll } from "@/lib/notifyAllAnalysts";
import { parseBody, portalAgendarSchema } from "@/lib/schemas";

// Fluxo leve e separado do /api/portal/avaliar: aqui o cliente só está
// confirmando QUANDO pode receber o candidato pra entrevista — nenhuma
// avaliação de fato aconteceu ainda, então não mexe em etapa_kanban,
// candidatos_vagas, dados de admissão nem dispara o e-mail de aprovação.
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
    if (!clienteUsuario) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

    const body = await request.json();
    const parsed = parseBody(portalAgendarSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { encaminhamento_id, data_entrevista } = parsed.data;

    // Nunca confia só na validação do navegador do cliente pra "data no futuro".
    if (Number.isNaN(new Date(data_entrevista).getTime()) || new Date(data_entrevista).getTime() <= Date.now()) {
      return NextResponse.json({ error: "A data e o horário da entrevista devem ser no futuro." }, { status: 400 });
    }

    const { data: enc } = await service
      .from("encaminhamentos")
      .select("id, candidato_id, status, vaga_id")
      .eq("id", encaminhamento_id)
      .eq("cliente_id", clienteUsuario.cliente_id)
      .single();

    if (!enc) return NextResponse.json({ error: "Encaminhamento não encontrado." }, { status: 404 });
    if (enc.status !== "aguardando_agendamento_cliente") {
      return NextResponse.json({ error: "Este encaminhamento não está aguardando agendamento." }, { status: 409 });
    }

    const { data: updated, error } = await service
      .from("encaminhamentos")
      .update({ data_entrevista, status: "aguardando" })
      .eq("id", encaminhamento_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const [{ data: candidato }, { data: cliente }] = await Promise.all([
      service.from("candidatos").select("nome_completo, responsavel, cargo_pretendido").eq("id", enc.candidato_id).single(),
      service.from("clientes").select("nome").eq("id", clienteUsuario.cliente_id).single(),
    ]);

    const candidatoNome = candidato?.nome_completo ?? "Candidato";
    const clienteNome = cliente?.nome ?? "Cliente";
    const dataFormatada = new Date(data_entrevista).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

    void registrarHistorico({
      candidato_id: enc.candidato_id,
      tipo: "agendamento_cliente",
      descricao: `Cliente confirmou entrevista para ${dataFormatada}`,
      metadata: { encaminhamento_id, cliente_id: clienteUsuario.cliente_id, data_entrevista },
    });

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">📅 Entrevista Agendada pelo Cliente</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151"><strong style="color:#111827">${clienteNome}</strong> confirmou a data da entrevista:</p>
    <div style="margin-bottom:20px;padding:14px 16px;background:#F0FDF4;border-radius:10px;border:1px solid #BBF7D0">
      <p style="margin:0;font-size:16px;font-weight:700;color:#166534">${candidatoNome}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#166534">${candidato?.cargo_pretendido ?? ""}</p>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 14px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6">Cliente</td><td style="padding:8px 14px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${clienteNome}</td></tr>
      <tr><td style="padding:8px 14px;font-weight:600;color:#6B7280;font-size:13px">Data e Horário</td><td style="padding:8px 14px;color:#111827;font-size:13px;font-weight:700">${dataFormatada}</td></tr>
    </table>
    <div style="text-align:center;padding-top:24px;border-top:1px solid #f3f4f6;margin-top:20px">
      <a href="https://salmazos-plataforma.vercel.app/painel/candidato/${enc.candidato_id}" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver perfil completo</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;

    await notifyResponsibleOrAll({
      responsavelNome: candidato?.responsavel ?? null,
      subject: `📅 Entrevista agendada — ${candidatoNome} — ${clienteNome}`,
      html,
      tipo: "agendamento_cliente",
      titulo: "Entrevista agendada pelo cliente",
      mensagem: `${clienteNome} agendou a entrevista de ${candidatoNome} para ${dataFormatada}`,
      candidato_id: enc.candidato_id,
      vaga_id: enc.vaga_id ?? undefined,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/portal/agendar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
