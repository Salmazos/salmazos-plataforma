import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, meuPerfilUpdateSchema } from "@/lib/schemas";

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
    .from("analistas_perfil")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

const CAMPOS_EDITAVEIS = [
  "nome_completo",
  "telefone",
  "data_nascimento",
  "endereco",
  "cidade",
  "estado",
  "cep",
  "contato_emergencia_nome",
  "contato_emergencia_telefone",
] as const;

export async function PATCH(request: NextRequest) {
  const user = await autenticar();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(meuPerfilUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updates: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    if (campo in parsed.data) updates[campo] = (parsed.data as Record<string, unknown>)[campo];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido enviado." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("analistas_perfil")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
