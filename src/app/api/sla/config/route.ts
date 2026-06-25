import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, slaConfigUpdateSchema } from "@/lib/schemas";

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
    .from("sla_config")
    .select("*")
    .order("etapa");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const user = await autenticar();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (user.app_metadata?.role !== "superuser") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = parseBody(slaConfigUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, prazo_dias_uteis, ativo } = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sla_config")
    .update({ prazo_dias_uteis, ativo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
