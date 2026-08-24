import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, documentoPastaSalmazosCreateSchema } from "@/lib/schemas";
import { checarAcessoDocumentos } from "@/lib/documentosAuth";

// Árvore de pastas da aba "Salmazos" de Documentos (documentos_pastas_salmazos) — aninhamento
// múltiplo via parent_id auto-referenciado. Sem parent_id (ou parent_id=""), lista/cria na
// raiz. Mesmo gate de acesso de página que o resto de /api/documentos.
export async function GET(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoDocumentos(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parent_id");

  const svc = createServiceClient();
  let query = svc
    .from("documentos_pastas_salmazos")
    .select("id, nome, parent_id, protegida")
    .order("criado_em", { ascending: true });
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoDocumentos(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(documentoPastaSalmazosCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  if (parsed.data.parent_id) {
    const { data: parentExiste } = await svc
      .from("documentos_pastas_salmazos")
      .select("id")
      .eq("id", parsed.data.parent_id)
      .maybeSingle();
    if (!parentExiste) return NextResponse.json({ error: "Pasta pai não encontrada." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("documentos_pastas_salmazos")
    .insert({
      nome: parsed.data.nome,
      parent_id: parsed.data.parent_id ?? null,
      criado_por_user_id: user.id,
    })
    .select("id, nome, parent_id, protegida")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
