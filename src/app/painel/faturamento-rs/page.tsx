import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FaturamentoRSPageClient, { type CobrancaFaturamentoRow, type ImpostoMensal } from "@/components/FaturamentoRSPageClient";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

function limitesMesBrasil(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = new Date(`${ano}-${String(mes).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
  const proxMes = mes === 12 ? 1 : mes + 1;
  const anoProx = mes === 12 ? ano + 1 : ano;
  const fim = new Date(`${anoProx}-${String(proxMes).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
  return { inicio, fim };
}

export default async function FaturamentoRSPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  // Restrito a PAPEIS_FULL_ACCESS diretamente — não usa checarAcessoCobrancaRS, então o
  // acesso configurável à tela de Cobranças R&S (ex: Giovanni) não se estende aqui.
  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) redirect("/painel");

  const hoje = obterDataHojeBrasil();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const svc = createServiceClient();
  const { inicio, fim } = limitesMesBrasil(ano, mes);

  const [{ data: cobrancas }, { data: imposto }] = await Promise.all([
    svc
      .from("cobrancas_rs")
      .select("id, cliente_nome_snapshot, candidato_nome_snapshot, tipo, fee_valor, pago_em")
      .eq("status", "paga")
      .gte("pago_em", inicio)
      .lt("pago_em", fim)
      .order("pago_em", { ascending: false }),
    svc
      .from("faturamento_rs_impostos_mensais")
      .select("ano, mes, percentual, atualizado_em")
      .eq("ano", ano)
      .eq("mes", mes)
      .maybeSingle(),
  ]);

  const rows: CobrancaFaturamentoRow[] = (cobrancas ?? []) as CobrancaFaturamentoRow[];
  const receitaBruta = rows.reduce((soma, c) => soma + (c.fee_valor ?? 0), 0);

  return (
    <FaturamentoRSPageClient
      anoInicial={ano}
      mesInicial={mes}
      cobrancasIniciais={rows}
      receitaBrutaInicial={receitaBruta}
      impostoInicial={(imposto as ImpostoMensal | null) ?? null}
    />
  );
}
