import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.comentarios_psicologo !== undefined)
    updates.comentarios_psicologo = body.comentarios_psicologo;
  if (body.psicologo_responsavel !== undefined)
    updates.psicologo_responsavel = body.psicologo_responsavel;
  if (body.status !== undefined) updates.status = body.status;
  if (body.data_aplicacao !== undefined)
    updates.data_aplicacao = body.data_aplicacao;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("avaliacoes_psicologicas")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("avaliacoes_psicologicas")
    .delete()
    .eq("id", id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
