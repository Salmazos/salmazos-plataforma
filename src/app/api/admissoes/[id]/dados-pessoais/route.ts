import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoDadosPessoaisAdminUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Edição total pelo analista (superuser/diretoria/supervisor/analista — sem checagem de
// papel aqui porque, neste app, "analista" já é o papel-base de qualquer usuário
// autenticado sem papel elevado; equivale a "qualquer usuário autenticado", ver
// src/app/painel/admissoes/[id]/page.tsx onde o gate de tela já inclui os 4 papéis).
// Cobre todos os campos de admissao_dados_pessoais preenchidos pelo candidato — antes
// essa rota só cobria "Data do exame admissional".
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoDadosPessoaisAdminUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: antes } = await svc
    .from("admissao_dados_pessoais")
    .select("*")
    .eq("admissao_id", id)
    .maybeSingle();

  const { data, error } = await svc
    .from("admissao_dados_pessoais")
    .upsert({ admissao_id: id, ...parsed.data }, { onConflict: "admissao_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_dados_pessoais_editados_pelo_analista",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { diff: diffCampos(antes, parsed.data) },
  });

  return NextResponse.json({ data });
}
