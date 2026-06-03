import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

    // Verify the encaminhamento belongs to this client
    const { data: enc } = await service
      .from("encaminhamentos")
      .select("id, candidato_id, status")
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

    // If approved, advance candidatos_vagas etapa
    if (status === "aprovado") {
      await service
        .from("candidatos_vagas")
        .update({ etapa: "aprovado_cliente" })
        .eq("candidato_id", enc.candidato_id);
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/portal/avaliar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
