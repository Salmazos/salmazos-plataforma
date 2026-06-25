import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, slaDestinatarioUpdateSchema } from "@/lib/schemas";

interface Params {
  params: Promise<{ id: string }>;
}

async function autenticarSuperuser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (user.app_metadata?.role !== "superuser") return null;
  return user;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await autenticarSuperuser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(slaDestinatarioUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { ativo } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sla_destinatarios")
    .update({ ativo })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await autenticarSuperuser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const svc = createServiceClient();
  const { error } = await svc
    .from("sla_destinatarios")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
