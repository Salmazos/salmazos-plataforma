import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, candidatoStatusSchema } from "@/lib/schemas";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(candidatoStatusSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { action, motivo, etapa } = parsed.data;

  const now = new Date().toISOString();
  let updates: Record<string, unknown> = {
    motivo_reprovacao: motivo ?? null,
    etapa_reprovacao: etapa ?? null,
    updated_at: now,
  };

  if (action === "retornar_banco") {
    updates = { ...updates, etapa_kanban: "triagem", status: "ativo" };
  } else if (action === "reprovar") {
    updates = { ...updates, status: "reprovado" };
  } else {
    updates = { ...updates, status: "negativado" };
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("candidatos")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
