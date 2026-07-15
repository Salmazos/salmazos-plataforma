import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, bancoParceiroUpdateSchema } from "@/lib/schemas";
import { splitEmails } from "@/lib/bancosParceiros";

interface Params { params: Promise<{ id: string }> }

async function autenticarSuperuser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.app_metadata?.role !== "superuser") {
    return { erro: NextResponse.json({ error: "Acesso restrito." }, { status: 403 }) };
  }
  return { user };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { erro } = await autenticarSuperuser();
  if (erro) return erro;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(bancoParceiroUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updates: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (parsed.data.nome !== undefined) updates.nome = parsed.data.nome;
  if (parsed.data.para !== undefined) updates.emails_para = splitEmails(parsed.data.para);
  if (parsed.data.cc !== undefined) updates.emails_cc = splitEmails(parsed.data.cc);
  if (parsed.data.ativo !== undefined) updates.ativo = parsed.data.ativo;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("bancos_parceiros")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// Exclusão definitiva só é permitida se o banco nunca foi usado em nenhuma carta enviada
// — caso contrário, orienta a desativar em vez de excluir (mesmo padrão de soft delete
// já usado em outros cadastros do sistema, ex: aniversariantes).
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { erro } = await autenticarSuperuser();
  if (erro) return erro;

  const svc = createServiceClient();

  const { count, error: countError } = await svc
    .from("admissoes")
    .select("id", { count: "exact", head: true })
    .eq("carta_banco_id", id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Este banco já foi usado em carta(s) enviada(s) e não pode ser excluído. Desative-o em vez disso." },
      { status: 400 }
    );
  }

  const { error } = await svc.from("bancos_parceiros").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
