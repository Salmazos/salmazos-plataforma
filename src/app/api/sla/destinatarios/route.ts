import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function autenticar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await autenticar();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sla_destinatarios")
    .select("*")
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const user = await autenticar();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (user.app_metadata?.role !== "superuser") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const body = await request.json();
  const { nome, email } = body as { nome: string; email: string };

  if (!nome?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sla_destinatarios")
    .insert({ nome: nome.trim(), email: email.trim().toLowerCase(), ativo: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
