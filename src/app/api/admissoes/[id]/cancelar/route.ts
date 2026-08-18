import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoCancelarSchema } from "@/lib/schemas";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Cancelamento é possível em QUALQUER status — inclusive depois de
// enviado_contabilidade, quando o gatilho automático (gerar-pdf/route.ts) já pode ter
// criado um registro em `funcionarios`. Esse registro nunca deveria existir se a
// admissão foi cancelada, então a limpeza acontece aqui — mas só quando é seguro: se já
// existir QUALQUER atividade real vinculada (ASO, contrato, rescisão), apagar
// silenciosamente destruiria histórico de verdade, então a rota se recusa e avisa em vez
// de decidir sozinha.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json();
  const parsed = parseBody(admissaoCancelarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { motivo } = parsed.data;

  const svc = createServiceClient();
  const agora = new Date().toISOString();

  const { data, error } = await svc
    .from("admissoes")
    .update({
      status: "cancelada",
      cancelada_em: agora,
      cancelada_por: user.id,
      cancelada_motivo: motivo,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let funcionarioRemovido = false;
  let avisoDependencia: string | null = null;

  const { data: funcionario } = await svc
    .from("funcionarios")
    .select("id")
    .eq("admissao_id", id)
    .maybeSingle();

  if (funcionario) {
    const [{ data: asos }, { data: contratos }, { data: rescisoes }] = await Promise.all([
      svc.from("funcionario_asos").select("id").eq("funcionario_id", funcionario.id).limit(1),
      svc.from("funcionario_contratos").select("id").eq("funcionario_id", funcionario.id).limit(1),
      svc.from("rescisoes").select("id").eq("funcionario_id", funcionario.id).limit(1),
    ]);

    const temDependencia = (asos?.length ?? 0) > 0 || (contratos?.length ?? 0) > 0 || (rescisoes?.length ?? 0) > 0;

    if (temDependencia) {
      avisoDependencia =
        "Esta admissão tinha um funcionário vinculado (funcionarios) com ASO, contrato ou rescisão já registrados. " +
        "Ele NÃO foi removido automaticamente — revise manualmente antes de qualquer exclusão.";
    } else {
      const { error: deleteError } = await svc.from("funcionarios").delete().eq("id", funcionario.id);
      if (!deleteError) {
        funcionarioRemovido = true;
      } else {
        avisoDependencia = `Não foi possível remover o funcionário órfão automaticamente: ${deleteError.message}`;
      }
    }
  }

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_cancelada",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { motivo, funcionario_removido: funcionarioRemovido, aviso_dependencia: avisoDependencia },
  });

  return NextResponse.json({ data, funcionario_removido: funcionarioRemovido, aviso: avisoDependencia });
}
