import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoAutorizacaoSindicalSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Autorização Sindical passou a ser preenchida/editada pelo analista (não mais pelo
// candidato) — mesmo padrão de PUT usado em admissao_adicionais, mas aqui é upsert de
// uma linha única por admissão (onConflict: admissao_id), não uma lista.
export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoAutorizacaoSindicalSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data, error } = await svc
    .from("admissao_autorizacao_sindical")
    .upsert({ admissao_id: id, ...parsed.data }, { onConflict: "admissao_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_autorizacao_sindical_atualizada",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: parsed.data,
  });

  return NextResponse.json({ data });
}
