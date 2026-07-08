import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, aniversarianteCreateSchema } from "@/lib/schemas";

// Módulo não lida com dado sensível (CPF/bancário) — acesso de leitura/escrita liberado
// pra qualquer usuário autenticado (superuser/diretoria/supervisor/analista), mesmo padrão
// já usado nas outras tabelas da plataforma. A restrição fica só na tela
// (/painel/aniversarios), que exige supervisor+.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const incluirInativos = searchParams.get("incluir_inativos") === "1";

  const svc = createServiceClient();
  let query = svc
    .from("aniversariantes_contatos")
    .select("*, clientes(id, nome)")
    .order("nome_contato");

  if (!incluirInativos) query = query.eq("ativo", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(aniversarianteCreateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const svc = createServiceClient();
    const { data, error } = await svc
      .from("aniversariantes_contatos")
      .insert({
        cliente_id: parsed.data.cliente_id || null,
        empresa_nome: parsed.data.empresa_nome || null,
        nome_contato: parsed.data.nome_contato,
        cargo: parsed.data.cargo || null,
        data_nascimento: parsed.data.data_nascimento,
        email: parsed.data.email || null,
        telefone: parsed.data.telefone || null,
        observacoes: parsed.data.observacoes || null,
        criado_por: user.id,
      })
      .select("*, clientes(id, nome)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/aniversariantes]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
