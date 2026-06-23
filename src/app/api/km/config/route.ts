import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const analistaId = request.nextUrl.searchParams.get("analista_id");
  if (!analistaId) return NextResponse.json({ error: "analista_id é obrigatório." }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("km_config")
    .select("*")
    .eq("analista_id", analistaId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { analista_id, tipo_servico, valor_por_km } = body;

  if (!analista_id || !tipo_servico || valor_por_km === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: analista_id, tipo_servico, valor_por_km" }, { status: 400 });
  }

  const svc = createServiceClient();
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
