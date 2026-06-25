import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function guardSuperuser() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") return null;
  return user;
}

export async function GET() {
  if (!(await guardSuperuser())) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("analistas_perfil")
    .select("*")
    .order("nome_completo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analistas: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await guardSuperuser())) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const { nome_completo, email, cargo, departamento, nivel_acesso, senha } = body;

  if (!nome_completo || !email || !senha) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  if (senha.length < 8) {
    return NextResponse.json({ error: "Senha deve ter no mínimo 8 caracteres" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { role: nivel_acesso || "analista" },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { error: perfilError } = await supabase.from("analistas_perfil").insert({
    user_id: authUser.user.id,
    nome_completo,
    email,
    cargo: cargo || null,
    departamento: departamento || null,
    nivel_acesso: nivel_acesso || "analista",
    ativo: true,
  });

  if (perfilError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: perfilError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
