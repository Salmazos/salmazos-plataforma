import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const candidato_id = searchParams.get("candidato_id");

  const supabase = createServiceClient();
  let query = supabase
    .from("encaminhamentos")
    .select("*, cliente:clientes(id, nome, cidade, segmento, servicos)")
    .order("created_at", { ascending: false });

  if (candidato_id) query = query.eq("candidato_id", candidato_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const required = ["candidato_id", "cliente_id", "data_entrevista"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `Campo obrigatório: ${field}` }, { status: 400 });
      }
    }

    const supabase = createServiceClient();

    // Verifica duplicidade (retorna para informar o front, mas não bloqueia)
    const { data: existente } = await supabase
      .from("encaminhamentos")
      .select("id, data_entrevista, status")
      .eq("candidato_id", body.candidato_id)
      .eq("cliente_id", body.cliente_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("encaminhamentos")
      .insert({
        candidato_id: body.candidato_id,
        cliente_id: body.cliente_id,
        data_entrevista: body.data_entrevista,
        status: "aguardando",
        tipo_servico: body.tipo_servico || null,
        observacoes: body.observacoes || null,
        vaga_id: body.vaga_id || null,
      })
      .select("*, cliente:clientes(id, nome, cidade, segmento, servicos)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data, duplicata: existente ?? null }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/encaminhamentos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
