import { NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
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
      return NextResponse.json({ error: "Não é um usuário de cliente." }, { status: 403 });

    const { data: cliente } = await service
      .from("clientes")
      .select("id, nome, contato_nome, cidade, segmento")
      .eq("id", clienteUsuario.cliente_id)
      .single();

    if (!cliente)
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

    return NextResponse.json({ data: cliente });
  } catch (err) {
    console.error("[GET /api/portal/me]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
