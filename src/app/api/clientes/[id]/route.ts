import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const campos: Record<string, unknown> = {};
    if (body.nome !== undefined) campos.nome = body.nome;
    if (body.contato_nome !== undefined) campos.contato_nome = body.contato_nome;
    if (body.contato_telefone !== undefined) campos.contato_telefone = body.contato_telefone;
    if (body.contato_email !== undefined) campos.contato_email = body.contato_email;
    if (body.cidade !== undefined) campos.cidade = body.cidade;
    if (body.segmento !== undefined) campos.segmento = body.segmento;
    if (body.ativo !== undefined) campos.ativo = body.ativo;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clientes")
      .update(campos)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/clientes/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
