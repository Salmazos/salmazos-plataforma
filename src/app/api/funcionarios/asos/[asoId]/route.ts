import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { parseBody, funcionarioDocumentoExcluirSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ asoId: string }>;
}

// Soft-delete — nunca DELETE de verdade (documento trabalhista precisa manter rastro).
// Restrito a superuser/diretoria (checarPapelFullAccess), mais estrito que o acesso geral
// ao módulo Funcionários (checarPapelFuncionarios, que também libera supervisor/dp) — só
// quem tem esse nível pode apagar um registro já lançado, mesmo que tenha sido lançado
// errado por engano.
export async function DELETE(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFullAccess(user);
  if (acessoNegado) return acessoNegado;

  const { asoId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(funcionarioDocumentoExcluirSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: asoAtual, error: buscaError } = await svc
    .from("funcionario_asos")
    .select("id, funcionario_id, data_exame, excluido_em")
    .eq("id", asoId)
    .maybeSingle();
  if (buscaError || !asoAtual) return NextResponse.json({ error: "Exame não encontrado." }, { status: 404 });
  if (asoAtual.excluido_em) return NextResponse.json({ error: "Este exame já foi excluído." }, { status: 409 });

  const { data, error } = await svc
    .from("funcionario_asos")
    .update({ excluido_em: new Date().toISOString(), excluido_por: user.id, motivo_exclusao: parsed.data.motivo })
    .eq("id", asoId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "funcionario_aso_excluido",
    entidade: "funcionario_asos",
    entidade_id: asoId,
    detalhes: { funcionario_id: asoAtual.funcionario_id, data_exame: asoAtual.data_exame, motivo: parsed.data.motivo },
  });

  return NextResponse.json({ data });
}
