import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelPonto } from "@/lib/pontoAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { checarAcessoFechamentoPontoRH } from "@/lib/rhUnidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelPonto(user);
  if (acessoNegado) return acessoNegado;

  const { id } = await params;
  const bloqueioUnidade = await checarAcessoFechamentoPontoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;
  const svc = createServiceClient();

  const { data: fechamento } = await svc
    .from("ponto_fechamentos")
    .select("id, cliente_id, periodo_inicio, periodo_fim, status, arquivo_original_nome, criado_em, clientes(nome)")
    .eq("id", id)
    .maybeSingle();
  if (!fechamento) return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 });

  const { data: funcionarios } = await svc
    .from("ponto_funcionarios")
    .select("id, funcionario_id, nome_planilha, ezepoint_codigo, cargo, data_admissao, totais, status_vinculo")
    .eq("fechamento_id", id)
    .order("nome_planilha");

  const funcionarioIds = (funcionarios ?? []).map((f) => f.id);
  const { data: dias } = funcionarioIds.length
    ? await svc
        .from("ponto_dias")
        .select("id, ponto_funcionario_id, data, dia_semana, marcacoes, nota_original, campos, fora_padrao, tipo_ocorrencia, justificativa_rh, status_decisao")
        .in("ponto_funcionario_id", funcionarioIds)
        .order("data")
    : { data: [] };

  const diasPorFuncionario = new Map<string, typeof dias>();
  for (const d of dias ?? []) {
    const lista = diasPorFuncionario.get(d.ponto_funcionario_id) ?? [];
    lista.push(d);
    diasPorFuncionario.set(d.ponto_funcionario_id, lista);
  }

  const funcionariosComDias = (funcionarios ?? []).map((f) => ({
    ...f,
    dias: diasPorFuncionario.get(f.id) ?? [],
  }));

  return NextResponse.json({ fechamento, funcionarios: funcionariosComDias });
}

// Só limpa um fechamento ainda em rascunho (nada enviado pro cliente) — depois disso vira
// histórico e apagar destruiria rastro de um documento que pode já ter ido pro portal.
export async function DELETE(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelPonto(user);
  if (acessoNegado) return acessoNegado;

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) {
    return NextResponse.json({ error: "Só diretoria/superuser pode excluir um fechamento." }, { status: 403 });
  }

  const { id } = await params;
  const bloqueioUnidade = await checarAcessoFechamentoPontoRH(user, id);
  if (bloqueioUnidade) return bloqueioUnidade;
  const svc = createServiceClient();

  const { data: fechamento } = await svc.from("ponto_fechamentos").select("status").eq("id", id).maybeSingle();
  if (!fechamento) return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 });
  if (fechamento.status !== "rascunho") {
    return NextResponse.json({ error: "Só é possível excluir um fechamento ainda em rascunho." }, { status: 400 });
  }

  const { error } = await svc.from("ponto_fechamentos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
