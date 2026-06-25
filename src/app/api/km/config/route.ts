import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, kmConfigSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const analistaId = request.nextUrl.searchParams.get("analista_id");

  // Always return global rows first
  const { data: globalCfg, error: globalErr } = await svc
    .from("km_config")
    .select("*")
    .eq("is_global", true);

  if (globalErr) return NextResponse.json({ error: globalErr.message }, { status: 500 });

  if (globalCfg && globalCfg.length > 0) {
    return NextResponse.json({ data: globalCfg });
  }

  // Fallback: per-analyst rows (legacy data only)
  if (analistaId) {
    const { data, error } = await svc
      .from("km_config")
      .select("*")
      .eq("analista_id", analistaId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ data: [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(kmConfigSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { analista_id, tipo_servico, valor_por_km, is_global } = parsed.data;

  const svc = createServiceClient();

  if (is_global) {
    // Always UPDATE the existing global row — never insert a duplicate
    const { data, error } = await svc
      .from("km_config")
      .update({ valor_por_km: Number(valor_por_km), updated_at: new Date().toISOString() })
      .eq("is_global", true)
      .eq("tipo_servico", tipo_servico)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  }

  // Legacy per-analyst upsert
  if (!analista_id) {
    return NextResponse.json({ error: "analista_id é obrigatório." }, { status: 400 });
  }
  const { data, error } = await svc
    .from("km_config")
    .upsert(
      { analista_id, tipo_servico, valor_por_km: Number(valor_por_km) },
      { onConflict: "analista_id,tipo_servico" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
