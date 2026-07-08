import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, aniversarianteUpdateSchema } from "@/lib/schemas";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(aniversarianteUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (parsed.data.cliente_id !== undefined) campos.cliente_id = parsed.data.cliente_id || null;
    if (parsed.data.empresa_nome !== undefined) campos.empresa_nome = parsed.data.empresa_nome || null;
    if (parsed.data.nome_contato !== undefined) campos.nome_contato = parsed.data.nome_contato;
    if (parsed.data.cargo !== undefined) campos.cargo = parsed.data.cargo || null;
    if (parsed.data.data_nascimento !== undefined) campos.data_nascimento = parsed.data.data_nascimento;
    if (parsed.data.email !== undefined) campos.email = parsed.data.email || null;
    if (parsed.data.telefone !== undefined) campos.telefone = parsed.data.telefone || null;
    if (parsed.data.observacoes !== undefined) campos.observacoes = parsed.data.observacoes || null;
    if (parsed.data.ativo !== undefined) campos.ativo = parsed.data.ativo;

    const svc = createServiceClient();
    const { data, error } = await svc
      .from("aniversariantes_contatos")
      .update(campos)
      .eq("id", id)
      .select("*, clientes(id, nome)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/aniversariantes/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

// Soft delete — preserva histórico, só marca ativo=false. A lista (GET) já exclui
// inativos por padrão.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const svc = createServiceClient();
    const { data, error } = await svc
      .from("aniversariantes_contatos")
      .update({ ativo: false, atualizado_em: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[DELETE /api/aniversariantes/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
