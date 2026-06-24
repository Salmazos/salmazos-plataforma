import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const globalOnly = params.get("global") === "true";
  const analistaId = params.get("analista_id");

  const svc = createServiceClient();

  // Try global config first
  const { data: globalCfg } = await svc
    .from("km_config")
    .select("*")
    .eq("is_global", true);

  if (globalCfg && globalCfg.length > 0) {
    return NextResponse.json({ data: globalCfg });
  }

  // Fallback to per-analyst config (legacy)
  if (!globalOnly && analistaId) {
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
  const { analista_id, tipo_servico, valor_por_km, is_global } = body;

  if (!tipo_servico || valor_por_km === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: tipo_servico, valor_por_km" }, { status: 400 });
  }

  const svc = createServiceClient();

  if (is_global) {
    // Find existing global row for this tipo_servico
    const { data: existing } = await svc
      .from("km_config")
      .select("id")
      .eq("is_global", true)
      .eq("tipo_servico", tipo_servico)
      .maybeSingle();

    if (existing) {
      const { data, error } = await svc
        .from("km_config")
        .update({ valor_por_km: Number(valor_por_km), updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data });
    }

    // Insert new global row
    const { data, error } = await svc
      .from("km_config")
      .insert({
        analista_id: analista_id,
        tipo_servico,
        valor_por_km: Number(valor_por_km),
        is_global: true,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
