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
    if (body.servicos !== undefined) campos.servicos = Array.isArray(body.servicos) ? body.servicos : [];
    if (body.ativo !== undefined) campos.ativo = body.ativo;
    if (body.responsavel_comercial !== undefined) campos.responsavel_comercial = body.responsavel_comercial || null;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clientes")
      .update(campos)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (body.ativo !== undefined) {
      const { data: usuarios } = await supabase
        .from("cliente_usuarios")
        .select("user_id")
        .eq("cliente_id", id);

      if (usuarios && usuarios.length > 0) {
        const banDuration = body.ativo ? "none" : "876600h";
        await Promise.all(
          usuarios.map((u) =>
            supabase.auth.admin.updateUserById(u.user_id, {
              ban_duration: banDuration,
            })
          )
        );
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/clientes/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
