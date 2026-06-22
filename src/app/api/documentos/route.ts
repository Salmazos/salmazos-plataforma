import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");
    const categoria = searchParams.get("categoria");
    const cliente_id = searchParams.get("cliente_id");

    const supabase = createServiceClient();
    let query = supabase
      .from("documentos")
      .select("*, clientes(nome)")
      .order("created_at", { ascending: false });

    if (tipo) query = query.eq("tipo", tipo);
    if (categoria) query = query.eq("categoria", categoria);
    if (cliente_id) query = query.eq("cliente_id", cliente_id);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/documentos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const required = ["nome", "categoria", "tipo", "storage_path"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Campo obrigatório: ${field}` },
          { status: 400 }
        );
      }
    }

    if (!["salmazos", "cliente"].includes(body.tipo)) {
      return NextResponse.json(
        { error: "Tipo deve ser 'salmazos' ou 'cliente'." },
        { status: 400 }
      );
    }

    if (body.tipo === "cliente" && !body.cliente_id) {
      return NextResponse.json(
        { error: "cliente_id é obrigatório para documentos do tipo 'cliente'." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("documentos")
      .insert({
        nome: body.nome,
        descricao: body.descricao ?? null,
        categoria: body.categoria,
        tipo: body.tipo,
        cliente_id: body.cliente_id ?? null,
        storage_path: body.storage_path,
        tamanho_bytes: body.tamanho_bytes ?? null,
        extensao: body.extensao ?? null,
        uploaded_by: body.uploaded_by ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/documentos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
