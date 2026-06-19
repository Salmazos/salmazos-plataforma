import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vagas")
    .select("*, clientes(id, nome)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const campos: Record<string, unknown> = {};
    if (body.titulo !== undefined)              campos.titulo = body.titulo;
    if (body.cliente_id !== undefined)          campos.cliente_id = body.cliente_id ?? null;
    if (body.tipo_servico !== undefined)        campos.tipo_servico = body.tipo_servico;
    if (body.num_posicoes !== undefined)        campos.num_posicoes = Number(body.num_posicoes);
    if (body.prazo !== undefined)               campos.prazo = body.prazo || null;
    if (body.status !== undefined)              campos.status = body.status;
    if (body.cidade !== undefined)              campos.cidade = body.cidade || null;
    if (body.estado !== undefined)              campos.estado = body.estado || null;
    if (body.salario !== undefined)             campos.salario = body.salario || null;
    if (body.requisitos !== undefined)          campos.requisitos = body.requisitos || null;
    if (body.beneficios !== undefined)          campos.beneficios = body.beneficios || null;
    if (body.horario !== undefined)             campos.horario = body.horario || null;
    if (body.habilidades_desejadas !== undefined) campos.habilidades_desejadas = body.habilidades_desejadas;
    if (body.responsavel !== undefined)         campos.responsavel = body.responsavel;
    if (body.observacoes !== undefined)         campos.observacoes = body.observacoes || null;
    if (body.fee_rs_percentual !== undefined)  campos.fee_rs_percentual = body.fee_rs_percentual !== "" ? Number(body.fee_rs_percentual) : null;
    if (body.fee_rs_prazo_cobranca !== undefined) campos.fee_rs_prazo_cobranca = body.fee_rs_prazo_cobranca || null;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vagas")
      .update(campos)
      .eq("id", id)
      .select("*, clientes(id, nome)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
