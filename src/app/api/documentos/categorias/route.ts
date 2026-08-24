import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, documentoCategoriaCustomizadaCreateSchema } from "@/lib/schemas";
import { checarAcessoDocumentos } from "@/lib/documentosAuth";
import { slugify } from "@/lib/utils";
import { CHAVES_CLIENTE_CATEGORIAS_FIXAS } from "@/lib/documentosCategorias";

// Categorias customizadas (pastas extras dentro da pasta de um cliente, ex: "Indicadores") —
// específicas por cliente_id, complementam as 5 fixas (CLIENTE_CATEGORIAS, hardcoded no
// client, nunca persistidas aqui). Mesmo gate de acesso de página que o resto de /api/documentos
// (checarAcessoDocumentos) — o botão "Criar Novo" já só aparece pra quem tem canUpload no
// client, mesmo padrão de gate client-side usado no resto desta tela.
export async function GET(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoDocumentos(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const clienteId = searchParams.get("cliente_id");
  if (!clienteId) return NextResponse.json({ error: "cliente_id é obrigatório." }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("documentos_categorias_customizadas")
    .select("id, chave, label")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: true });

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
  const parsed = parseBody(documentoCategoriaCustomizadaCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const chave = slugify(parsed.data.label);
  if (!chave) return NextResponse.json({ error: "Nome de pasta inválido." }, { status: 400 });
  if (CHAVES_CLIENTE_CATEGORIAS_FIXAS.has(chave)) {
    return NextResponse.json({ error: "Já existe uma pasta padrão com esse nome." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("documentos_categorias_customizadas")
    .insert({
      cliente_id: parsed.data.cliente_id,
      chave,
      label: parsed.data.label,
      criado_por_user_id: user.id,
    })
    .select("id, chave, label")
    .single();

  if (error) {
    // UNIQUE(cliente_id, chave) — mesmo nome de pasta pro mesmo cliente já existe.
    if (error.code === "23505") {
      return NextResponse.json({ error: "Já existe uma pasta com esse nome para este cliente." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
