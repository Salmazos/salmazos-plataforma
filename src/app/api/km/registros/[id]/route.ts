import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const updatePayload: Record<string, unknown> = {};
  if (body.data !== undefined) updatePayload.data = body.data;
  if (body.km_inicial !== undefined) updatePayload.km_inicial = Number(body.km_inicial);
  if (body.km_final !== undefined) updatePayload.km_final = Number(body.km_final);
  if (body.destino !== undefined) updatePayload.destino = body.destino || null;
  if (body.cliente_visitado !== undefined) updatePayload.cliente_visitado = body.cliente_visitado || null;
  if (body.motivo !== undefined) updatePayload.motivo = body.motivo || null;
  if (body.resultado !== undefined) updatePayload.resultado = body.resultado || null;
  if (body.tipo_servico !== undefined) updatePayload.tipo_servico = body.tipo_servico || null;
  if (body.valor_por_km !== undefined) updatePayload.valor_por_km = body.valor_por_km ? Number(body.valor_por_km) : null;

  if (updatePayload.km_inicial !== undefined || updatePayload.km_final !== undefined) {
    const svcCheck = createServiceClient();
    const { data: existing } = await svcCheck.from("km_registros").select("km_inicial, km_final").eq("id", id).single();
    const kmInicial = (updatePayload.km_inicial as number) ?? existing?.km_inicial ?? 0;
    const kmFinal = (updatePayload.km_final as number) ?? existing?.km_final ?? 0;
    if (kmFinal < kmInicial) {
      return NextResponse.json({ error: "km_final deve ser maior ou igual a km_inicial." }, { status: 400 });
    }
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("km_registros")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const svc = createServiceClient();
  const { error } = await svc.from("km_registros").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
