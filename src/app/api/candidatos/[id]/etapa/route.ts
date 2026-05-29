import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const ETAPAS_VALIDAS = ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"];

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { etapa_kanban } = body;

  if (!ETAPAS_VALIDAS.includes(etapa_kanban)) {
    return NextResponse.json({ error: "Etapa inválida." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("candidatos")
    .update({ etapa_kanban, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
