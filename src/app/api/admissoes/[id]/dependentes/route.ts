import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoDependenteCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Criação de dependente pelo analista — mesmo schema usado pelo candidato no formulário
// público (POST /api/admissoes/token/[token]/dependentes), rota autenticada equivalente
// pro painel (edição total, ver PATCH/DELETE em [depId]/route.ts).
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoDependenteCreateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data, error } = await svc
    .from("admissao_dependentes")
    .insert({ admissao_id: id, ...parsed.data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_dependente_criado_pelo_analista",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { dependente_id: data.id, ...parsed.data },
  });

  return NextResponse.json({ data });
}
