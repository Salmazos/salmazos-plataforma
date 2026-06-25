import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { parseBody, portalSolicitarVagaSchema } from "@/lib/schemas";

const TIPO_LABEL: Record<string, string> = {
  recrutamento_selecao: "Recrutamento e Seleção",
  mao_obra_temporaria: "Mão de Obra Temporária",
  terceirizacao: "Terceirização",
};

export async function GET() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();

  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: cliente } = await service
    .from("clientes")
    .select("beneficios_padrao, horario_padrao")
    .eq("id", cu.cliente_id)
    .single();

  return NextResponse.json({
    beneficios_padrao: cliente?.beneficios_padrao ?? null,
    horario_padrao: cliente?.horario_padrao ?? null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createPortalClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const service = createServiceClient();

    const { data: cu } = await service
      .from("cliente_usuarios")
      .select("cliente_id")
      .eq("user_id", user.id)
      .single();
    if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

    const { data: cliente } = await service
      .from("clientes")
      .select("nome")
      .eq("id", cu.cliente_id)
      .single();

    const clienteNome = cliente?.nome ?? "Cliente";
    const body = await request.json();
    const parsed = parseBody(portalSolicitarVagaSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data: solicitacao, error } = await service
      .from("solicitacoes_vagas")
      .insert({
        cliente_id: cu.cliente_id,
        cliente_nome: clienteNome,
        cargo: body.cargo.trim(),
        tipo_servico: body.tipo_servico,
        num_posicoes: Number(body.num_posicoes) || 1,
        cidade: body.cidade.trim(),
        estado: body.estado.trim(),
        salario: body.salario || null,
        horario_tipo: body.horario_tipo || null,
        horario_texto: body.horario_texto || null,
        previsao_inicio: body.previsao_inicio || null,
        requisitos: body.requisitos || null,
        requisitos_chips: body.requisitos_chips ?? null,
        beneficios: body.beneficios || null,
        beneficios_chips: body.beneficios_chips ?? null,
        observacoes: body.observacoes || null,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const clienteUpdate: Record<string, unknown> = {};
    if (body.beneficios_chips) clienteUpdate.beneficios_padrao = body.beneficios_chips;
    if (body.horario_padrao) clienteUpdate.horario_padrao = body.horario_padrao;
    if (Object.keys(clienteUpdate).length > 0) {
      await service
        .from("clientes")
        .update(clienteUpdate)
        .eq("id", cu.cliente_id);
    }

    const { data: analistas } = await service
      .from("analistas_perfil")
      .select("user_id")
      .in("nivel_acesso", ["superuser", "diretoria"])
      .eq("ativo", true);

    if (analistas && analistas.length > 0) {
      const notifs = analistas
        .filter((a) => a.user_id)
        .map((a) => ({
          tipo: "nova_solicitacao_vaga",
          titulo: "Nova solicitação de vaga",
          mensagem: `${clienteNome} solicitou ${body.num_posicoes || 1}x ${body.cargo}`,
          user_id: a.user_id,
          candidato_id: null,
        }));
      if (notifs.length > 0) {
        await service.from("notificacoes_analista").insert(notifs);
      }
    }

    const numPos = body.num_posicoes || 1;
    const tipoLbl = TIPO_LABEL[body.tipo_servico] ?? body.tipo_servico;

    const detailRow = (label: string, value: string | null | undefined) =>
      value ? `<tr><td style="padding:8px 14px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:8px 14px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${value}</td></tr>` : "";

    const requisitosHtml = body.requisitos
      ? `<div style="margin:20px 0">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Requisitos</p>
          <div style="background:#f9fafb;border-radius:8px;padding:12px 16px;font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap">${body.requisitos}</div>
        </div>`
      : "";

    const beneficiosHtml = body.beneficios
      ? `<div style="margin:20px 0">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Benefícios</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;font-size:13px;color:#166534;line-height:1.7;white-space:pre-wrap">${body.beneficios}</div>
        </div>`
      : "";

    const observacoesHtml = body.observacoes
      ? `<div style="margin:20px 0">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.07em">Observações</p>
          <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400E;line-height:1.6">${body.observacoes}</div>
        </div>`
      : "";

    const previsaoFormatted = body.previsao_inicio
      ? body.previsao_inicio.split("-").reverse().join("/")
      : null;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#FFB800;text-transform:uppercase;letter-spacing:.15em">SALMAZOS RH &amp; SERVIÇOS</p>
    <h1 style="color:#FFD700;margin:0;font-size:20px">🔔 Nova Solicitação de Vaga</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Nova solicitação recebida de <strong style="color:#111827">${clienteNome}</strong>:</p>
    <div style="margin-bottom:20px;padding:14px 16px;background:#DBEAFE;border-radius:10px;border:1px solid #93C5FD">
      <p style="margin:0;font-size:16px;font-weight:700;color:#1D4ED8">${body.cargo}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#1E40AF">${numPos} posição${numPos !== 1 ? "ões" : ""} · ${tipoLbl}</p>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${detailRow("Cargo", body.cargo)}
      ${detailRow("Tipo de Serviço", tipoLbl)}
      ${detailRow("Nº de Posições", String(numPos))}
      ${detailRow("Cidade/Estado", [body.cidade, body.estado].filter(Boolean).join(" / "))}
      ${detailRow("Previsão de Início", previsaoFormatted)}
      ${detailRow("Salário", body.salario)}
      ${detailRow("Horário", body.horario_texto || body.horario_tipo)}
    </table>
    ${requisitosHtml}
    ${beneficiosHtml}
    ${observacoesHtml}
    <div style="text-align:center;padding-top:24px;border-top:1px solid #f3f4f6;margin-top:20px">
      <a href="https://salmazos-plataforma.vercel.app/painel/vagas" style="display:inline-block;padding:12px 28px;background:#000;color:#FFD700;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">Ver Solicitação</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">© 2026 Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;

    void notifyAllAnalysts({
      subject: `🔔 Nova Solicitação de Vaga — ${clienteNome}`,
      html,
      tipo: "solicitacao_vaga",
    });

    return NextResponse.json({ success: true, id: solicitacao.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/portal/solicitar-vaga]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
