import { NextRequest, NextResponse } from "next/server";
import { resolverUnidadeFaturamento } from "@/lib/faturamentoUnidades";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";

export const dynamic = "force-dynamic";

// Lista TODOS os percentuais de imposto já lançados (não só o mês selecionado) — usado pra
// calcular o Valor Líquido por lançamento na tabela principal, já que ela mostra lançamentos
// de vários meses ao mesmo tempo (ver FaturamentoHortolandiaPageClient.tsx).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;
  const { unidadeId, erro } = await resolverUnidadeFaturamento(user, new URL(request.url).searchParams.get("unidade"));
  if (erro) return erro;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("faturamento_hortolandia_impostos_mensais")
    .select("ano, mes, percentual")
    .eq("unidade_id", unidadeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
