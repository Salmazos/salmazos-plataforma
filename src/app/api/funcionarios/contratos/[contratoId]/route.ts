import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { parseBody, funcionarioDocumentoExcluirSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ contratoId: string }>;
}

// Soft-delete — nunca DELETE de verdade (documento trabalhista precisa manter rastro).
// Restrito a superuser/diretoria (checarPapelFullAccess), mais estrito que o acesso geral
// ao módulo Funcionários (checarPapelFuncionarios, que também libera supervisor/dp).
export async function DELETE(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFullAccess(user);
  if (acessoNegado) return acessoNegado;

  const { contratoId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(funcionarioDocumentoExcluirSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: contratoAtual, error: buscaError } = await svc
    .from("funcionario_contratos")
    .select("id, funcionario_id, nome_arquivo_original, excluido_em")
    .eq("id", contratoId)
    .maybeSingle();
  if (buscaError || !contratoAtual) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  if (contratoAtual.excluido_em) return NextResponse.json({ error: "Este contrato já foi excluído." }, { status: 409 });

  const { data, error } = await svc
    .from("funcionario_contratos")
    .update({ excluido_em: new Date().toISOString(), excluido_por: user.id, motivo_exclusao: parsed.data.motivo })
    .eq("id", contratoId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_contrato_excluido",
    entidade: "funcionario_contratos",
    entidade_id: contratoId,
    detalhes: { funcionario_id: contratoAtual.funcionario_id, nome_arquivo_original: contratoAtual.nome_arquivo_original, motivo: parsed.data.motivo },
  });

  return NextResponse.json({ data });
}
