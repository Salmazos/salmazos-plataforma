import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelPonto } from "@/lib/pontoAuth";
import { parseBody, pontoDiaEditarSchema } from "@/lib/schemas";
import { checarAcessoFechamentoPontoRH } from "@/lib/rhUnidadeAuth";

interface Params {
  params: Promise<{ id: string; diaId: string }>;
}

// Edição do dia (marcações/campos/tipo de ocorrência/justificativa) — só enquanto o
// fechamento está em rascunho; depois de enviado pro cliente (etapa 2) essa mesma rota
// vai precisar de uma trava extra, mas isso é assunto de quando essa etapa for construída.
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelPonto(user);
  if (acessoNegado) return acessoNegado;

  const { id: fechamentoId, diaId } = await params;
  const bloqueioUnidade = await checarAcessoFechamentoPontoRH(user, fechamentoId);
  if (bloqueioUnidade) return bloqueioUnidade;
  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(pontoDiaEditarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: fechamento } = await svc.from("ponto_fechamentos").select("status").eq("id", fechamentoId).maybeSingle();
  if (!fechamento) return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 });
  if (fechamento.status !== "rascunho") {
    return NextResponse.json({ error: "Este fechamento já não está em rascunho." }, { status: 400 });
  }

  // Confere que o dia pertence de fato a um funcionário deste fechamento (evita editar um
  // ponto_dias de outro fechamento só porque alguém adivinhou/reaproveitou um id de URL).
  const { data: dia } = await svc
    .from("ponto_dias")
    .select("id, ponto_funcionario_id, ponto_funcionarios!inner(fechamento_id)")
    .eq("id", diaId)
    .maybeSingle();
  if (!dia || (dia.ponto_funcionarios as unknown as { fechamento_id: string }).fechamento_id !== fechamentoId) {
    return NextResponse.json({ error: "Dia não encontrado neste fechamento." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.marcacoes !== undefined) patch.marcacoes = parsed.data.marcacoes;
  if (parsed.data.campos !== undefined) patch.campos = parsed.data.campos;
  if (parsed.data.tipo_ocorrencia !== undefined) patch.tipo_ocorrencia = parsed.data.tipo_ocorrencia;
  if (parsed.data.justificativa_rh !== undefined) patch.justificativa_rh = parsed.data.justificativa_rh;

  const { data, error } = await svc.from("ponto_dias").update(patch).eq("id", diaId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
