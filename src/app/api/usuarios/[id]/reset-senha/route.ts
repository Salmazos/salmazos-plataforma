import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, resetSenhaSchema } from "@/lib/schemas";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const parsed = parseBody(resetSenhaSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { senha } = parsed.data;

  const supabase = createServiceClient();

  const { data: perfil } = await supabase
    .from("analistas_perfil")
    .select("user_id")
    .eq("id", id)
    .single();

  if (!perfil?.user_id) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const { error } = await supabase.auth.admin.updateUserById(perfil.user_id, {
    password: senha,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
