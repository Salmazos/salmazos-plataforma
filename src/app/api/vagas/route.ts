import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cliente_id = searchParams.get("cliente_id");
  const supabase = createServiceClient();
  let query = supabase
    .from("vagas")
    .select("*, clientes(id, nome)")
    .order("created_at", { ascending: false });
  if (cliente_id) query = query.eq("cliente_id", cliente_id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const required = ["titulo", "tipo_servico", "num_posicoes", "responsavel"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `Campo obrigatório: ${field}` }, { status: 400 });
      }
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vagas")
      .insert({
        titulo: body.titulo,
        cliente_id: body.cliente_id ?? null,
        tipo_servico: body.tipo_servico,
        num_posicoes: Number(body.num_posicoes),
        prazo: body.prazo || null,
        status: body.status ?? "aberta",
        cidade: body.cidade || null,
        estado: body.estado || null,
        salario: body.salario || null,
        requisitos: body.requisitos || null,
        beneficios: body.beneficios || null,
        horario: body.horario || null,
        habilidades_desejadas: Array.isArray(body.habilidades_desejadas)
          ? body.habilidades_desejadas
          : [],
        responsavel: body.responsavel,
        observacoes: body.observacoes || null,
        fee_rs_percentual: body.fee_rs_percentual ? Number(body.fee_rs_percentual) : null,
        fee_rs_prazo_cobranca: body.fee_rs_prazo_cobranca || null,
      })
      .select("*, clientes(id, nome)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/vagas]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
