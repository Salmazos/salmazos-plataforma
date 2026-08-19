import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, clienteCreateSchema } from "@/lib/schemas";
import { checarAcessoClientes } from "@/lib/comercialAuth";

export async function GET() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoClientes(user);
  if (acessoNegado) return acessoNegado;

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
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const acessoNegado = await checarAcessoClientes(user);
    if (acessoNegado) return acessoNegado;

    const body = await request.json();
    const parsed = parseBody(clienteCreateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
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
        responsavel_comercial: body.responsavel_comercial ?? null,
        entidade_contratante: body.entidade_contratante || null,
        cnpj: body.cnpj || null,
        endereco: body.endereco || null,
        processo_simplificado: body.processo_simplificado ?? false,
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
