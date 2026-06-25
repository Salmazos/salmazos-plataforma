import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, kmRegistroUpdateSchema } from "@/lib/schemas";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = parseBody(kmRegistroUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.data !== undefined) updatePayload.data = parsed.data.data;
  if (parsed.data.km_inicial !== undefined) updatePayload.km_inicial = Number(parsed.data.km_inicial);
  if (parsed.data.km_final !== undefined) updatePayload.km_final = Number(parsed.data.km_final);
  if (parsed.data.destino !== undefined) updatePayload.destino = parsed.data.destino || null;
  if (parsed.data.cliente_visitado !== undefined) updatePayload.cliente_visitado = parsed.data.cliente_visitado || null;
  if (parsed.data.motivo !== undefined) updatePayload.motivo = parsed.data.motivo || null;
  if (parsed.data.resultado !== undefined) updatePayload.resultado = parsed.data.resultado || null;
  if (parsed.data.tipo_servico !== undefined) updatePayload.tipo_servico = parsed.data.tipo_servico || null;
  if (parsed.data.valor_por_km !== undefined) updatePayload.valor_por_km = parsed.data.valor_por_km ? Number(parsed.data.valor_por_km) : null;
  if (parsed.data.outros_custos !== undefined) updatePayload.outros_custos = parsed.data.outros_custos;

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
