import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoRs } from "@/lib/faturamentoRsAuth";
import { limitesMesBrasil } from "@/lib/faturamentoRS";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

interface MesBucket {
  ano: number;
  mes: number;
  inicio: string;
  fim: string;
}

function ultimosMeses(qtd: number): MesBucket[] {
  const hoje = obterDataHojeBrasil();
  const buckets: MesBucket[] = [];
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mes = d.getMonth() + 1;
    const { inicio, fim } = limitesMesBrasil(ano, mes);
    buckets.push({ ano, mes, inicio, fim });
  }
  return buckets;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoRs(user);
  if (acessoNegado) return acessoNegado;

  const { searchParams } = new URL(request.url);
  const mesesParam = Number(searchParams.get("meses"));
  const qtdMeses = Number.isInteger(mesesParam) && mesesParam > 0 && mesesParam <= 36 ? mesesParam : 12;

  const buckets = ultimosMeses(qtdMeses);
  const primeiro = buckets[0];
  const ultimo = buckets[buckets.length - 1];

  const svc = createServiceClient();
  const anosEnvolvidos = [...new Set(buckets.map((b) => b.ano))];

  const [{ data: cobrancas }, { data: ajustes }, { data: impostos }] = await Promise.all([
    svc
      .from("cobrancas_rs")
      .select("fee_valor, pago_em")
      .eq("status", "paga")
      .gte("pago_em", primeiro.inicio)
      .lt("pago_em", ultimo.fim),
    svc
      .from("faturamento_rs_ajustes_manuais")
      .select("ano, mes, valor")
      .in("ano", anosEnvolvidos),
    svc
      .from("faturamento_rs_impostos_mensais")
      .select("ano, mes, percentual")
      .in("ano", anosEnvolvidos),
  ]);

  const resultado = buckets.map((b) => {
    const receitaCobrancas = (cobrancas ?? [])
      .filter((c) => c.pago_em >= b.inicio && c.pago_em < b.fim)
      .reduce((soma, c) => soma + (c.fee_valor ?? 0), 0);

    const receitaAjustes = (ajustes ?? [])
      .filter((a) => a.ano === b.ano && a.mes === b.mes)
      .reduce((soma, a) => soma + a.valor, 0);

    const receitaBrutaTotal = receitaCobrancas + receitaAjustes;

    const imposto = (impostos ?? []).find((i) => i.ano === b.ano && i.mes === b.mes) ?? null;
    const percentualImposto = imposto?.percentual ?? null;
    const receitaLiquida =
      percentualImposto != null ? receitaBrutaTotal - (receitaBrutaTotal * percentualImposto) / 100 : null;

    return {
      ano: b.ano,
      mes: b.mes,
      receitaBrutaTotal,
      percentualImposto,
      receitaLiquida,
    };
  });

  return NextResponse.json({ data: resultado });
}
