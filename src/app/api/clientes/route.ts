import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nome");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const required = ["nome", "contato_nome", "contato_telefone", "contato_email", "cidade", "segmento"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `Campo obrigatório: ${field}` }, { status: 400 });
      }
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nome: body.nome,
        contato_nome: body.contato_nome,
        contato_telefone: body.contato_telefone,
        contato_email: body.contato_email,
        cidade: body.cidade,
        segmento: body.segmento,
        servicos: Array.isArray(body.servicos) ? body.servicos : [],
        ativo: true,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/clientes]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
