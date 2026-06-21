import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

async function getClienteId() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  return cu?.cliente_id ?? null;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const clienteId = await getClienteId();
  if (!clienteId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("vaga_templates_cliente")
    .select("*")
    .eq("id", id)
    .eq("cliente_id", clienteId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const clienteId = await getClienteId();
  if (!clienteId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json();
  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const allowed = [
    "nome", "cargo", "tipo_servico", "cidade", "estado", "salario",
    "horario_tipo", "horario_texto", "horario_padrao",
    "requisitos", "requisitos_chips", "beneficios", "beneficios_chips", "observacoes",
  ];
  for (const key of allowed) {
    if (body[key] !== undefined) campos[key] = body[key];
  }

  const service = createServiceClient();
  const { error } = await service
    .from("vaga_templates_cliente")
    .update(campos)
    .eq("id", id)
    .eq("cliente_id", clienteId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const clienteId = await getClienteId();
  if (!clienteId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service
    .from("vaga_templates_cliente")
    .delete()
    .eq("id", id)
    .eq("cliente_id", clienteId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
