import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoDependenteUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";

interface Params {
  params: Promise<{ id: string; depId: string }>;
}

// Edição/remoção de dependente pelo analista — edição total, sem equivalente no fluxo do
// candidato (que só cria/exclui, nunca edita um dependente já salvo).
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, depId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoDependenteUpdateSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: antes } = await svc
    .from("admissao_dependentes")
    .select("*")
    .eq("id", depId)
    .eq("admissao_id", id)
    .maybeSingle();

  const { data, error } = await svc
    .from("admissao_dependentes")
    .update(parsed.data)
    .eq("id", depId)
    .eq("admissao_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_dependente_editado_pelo_analista",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { dependente_id: depId, diff: diffCampos(antes, parsed.data) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id, depId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const { error } = await svc.from("admissao_dependentes").delete().eq("id", depId).eq("admissao_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_dependente_removido_pelo_analista",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { dependente_id: depId },
  });

  return NextResponse.json({ success: true });
}
