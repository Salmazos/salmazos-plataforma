import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendEmail";

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

    if (!body.cargo?.trim()) {
      return NextResponse.json({ error: "Cargo é obrigatório." }, { status: 400 });
    }
    if (!body.tipo_servico) {
      return NextResponse.json({ error: "Tipo de serviço é obrigatório." }, { status: 400 });
    }
    if (!body.cidade?.trim() || !body.estado?.trim()) {
      return NextResponse.json({ error: "Cidade e estado são obrigatórios." }, { status: 400 });
    }

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

    if (body.beneficios_chips) {
      await service
        .from("clientes")
        .update({ beneficios_padrao: body.beneficios_chips })
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
      value ? `<tr><td style="padding:6px 12px;font-weight:600;color:#6B7280;font-size:13px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${label}</td><td style="padding:6px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f3f4f6">${value}</td></tr>` : "";

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:28px 32px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:20px">🔔 Nova Solicitação de Vaga</h1>
  </div>
  <div style="padding:28px 32px">
    <div style="margin-bottom:20px;padding:12px 16px;background:#DBEAFE;border-radius:8px;border:1px solid #93C5FD">
      <p style="margin:0;font-size:14px;font-weight:700;color:#1D4ED8">${clienteNome}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#1E40AF">${numPos}x ${body.cargo} — ${tipoLbl}</p>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${detailRow("Cargo", body.cargo)}
      ${detailRow("Tipo de Serviço", tipoLbl)}
      ${detailRow("Nº de Posições", String(numPos))}
      ${detailRow("Cidade", body.cidade)}
      ${detailRow("Estado", body.estado)}
      ${detailRow("Salário", body.salario)}
      ${detailRow("Horário", body.horario_texto || body.horario_tipo)}
      ${detailRow("Previsão de Início", body.previsao_inicio ? body.previsao_inicio.split("-").reverse().join("/") : null)}
      ${detailRow("Requisitos", body.requisitos)}
      ${detailRow("Benefícios", body.beneficios)}
      ${detailRow("Observações", body.observacoes)}
    </table>
    <div style="text-align:center;padding-top:20px;border-top:1px solid #f3f4f6;margin-top:16px">
      <a href="https://salmazos-plataforma.vercel.app/painel/solicitacoes" style="display:inline-block;padding:10px 24px;background:#000;color:#FFD700;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Ver no Painel</a>
    </div>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH &amp; Serviços — Notificação automática</p>
  </div>
</div>
</body></html>`;

    void sendEmail({
      to: "olver@salmazos.com.br",
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
