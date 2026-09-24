import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, clienteCreateSchema } from "@/lib/schemas";
import { checarAcessoClientes } from "@/lib/comercialAuth";
import { obterContextoUnidade } from "@/lib/unidadeAuth";

export async function GET() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoClientes(user);
  if (acessoNegado) return acessoNegado;

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  // Esta rota alimenta todos os selects de cliente do sistema (nova/editar vaga,
  // encaminhamento, admissão rápida, KM, aniversários...) — filtrar aqui mantém todos eles
  // na unidade de quem está usando.
  const supabase = createServiceClient();
  let query = supabase
    .from("clientes")
    .select("*")
    .order("nome");
  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);
  const { data, error } = await query;
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

    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const body = await request.json();
    const parsed = parseBody(clienteCreateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Cliente nasce na unidade de quem cria (explícito, não o DEFAULT do banco). Só quem tem
    // acesso a todas as unidades (sócios) escolhe outra — é o caso de cadastrar cliente de
    // SBC estando com perfil de Monte Mor/Hortolândia.
    const unidadeId = ctx.todasUnidades && parsed.data.unidade_id ? parsed.data.unidade_id : ctx.unidadeId;

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
        unidade_id: unidadeId,
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
