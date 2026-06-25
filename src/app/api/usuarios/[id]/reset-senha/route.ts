import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;
  const { senha } = await req.json();

  if (!senha || senha.length < 8) {
    return NextResponse.json({ error: "Senha deve ter no mínimo 8 caracteres" }, { status: 400 });
  }

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
