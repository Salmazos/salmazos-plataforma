import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const analistaId = params.get("analista_id");
  const from = params.get("from");
  const to = params.get("to");

  if (!analistaId) return NextResponse.json({ error: "analista_id é obrigatório." }, { status: 400 });

  const svc = createServiceClient();
  let query = svc
    .from("km_registros")
    .select("*")
    .eq("analista_id", analistaId)
    .order("data", { ascending: false });

  if (from) query = query.gte("data", from);
  if (to) query = query.lte("data", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { analista_id, data: dataRegistro, km_inicial, km_final, destino, cliente_visitado, motivo, resultado, tipo_servico, valor_por_km } = body;

  if (!analista_id || !dataRegistro || km_inicial === undefined || km_final === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: analista_id, data, km_inicial, km_final" }, { status: 400 });
  }

  if (Number(km_final) < Number(km_inicial)) {
    return NextResponse.json({ error: "km_final deve ser maior ou igual a km_inicial." }, { status: 400 });
  }

  const km_total = Number(km_final) - Number(km_inicial);
  const valor_total = valor_por_km ? km_total * Number(valor_por_km) : null;

  const svc = createServiceClient();
  const { data: registro, error } = await svc
    .from("km_registros")
    .insert({
      analista_id,
      data: dataRegistro,
      km_inicial: Number(km_inicial),
      km_final: Number(km_final),
      km_total,
      destino: destino || null,
      cliente_visitado: cliente_visitado || null,
      motivo: motivo || null,
      resultado: resultado || null,
      tipo_servico: tipo_servico || null,
      valor_por_km: valor_por_km ? Number(valor_por_km) : null,
      valor_total,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: registro }, { status: 201 });
}
