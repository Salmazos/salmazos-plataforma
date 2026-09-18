import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import FaturamentoHortolandiaPageClient, {
  type ContaReceberRow,
  type ContaPagarRow,
} from "@/components/FaturamentoHortolandiaPageClient";

export const dynamic = "force-dynamic";

export default async function FaturamentoHortolandiaPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarFaturamentoHortolandia(user))) redirect("/painel");

  const svc = createServiceClient();
  const hoje = obterDataHojeBrasil();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const [{ data }, { data: saidas }, { data: imposto }, { data: todosImpostos }] = await Promise.all([
    svc
      .from("contas_receber_hortolandia")
      .select("*, clientes(id, nome)")
      .order("data_vencimento", { ascending: true }),
    svc.from("contas_pagar_hortolandia").select("*").order("data_pagamento", { ascending: false }),
    svc
      .from("faturamento_hortolandia_impostos_mensais")
      .select("ano, mes, percentual, atualizado_em")
      .eq("ano", ano)
      .eq("mes", mes)
      .maybeSingle(),
    // Todos os meses já lançados — pra calcular o Valor Líquido por lançamento na tabela,
    // que mostra lançamentos de vários meses ao mesmo tempo (não só o mês selecionado acima).
    svc.from("faturamento_hortolandia_impostos_mensais").select("ano, mes, percentual"),
  ]);

  const impostosPorMesInicial: Record<string, number> = {};
  for (const i of todosImpostos ?? []) {
    impostosPorMesInicial[`${i.ano}-${String(i.mes).padStart(2, "0")}`] = i.percentual;
  }

  const rows: ContaReceberRow[] = (data ?? []).map((r) => ({
    id: r.id,
    clienteId: r.cliente_id,
    clienteNome: (Array.isArray(r.clientes) ? r.clientes[0]?.nome : r.clientes?.nome) ?? "—",
    numeroNf: r.numero_nf,
    valor: r.valor,
    dataVencimento: r.data_vencimento,
    dataPagamento: r.data_pagamento,
    dataEmissaoNf: r.data_emissao_nf,
    status: r.status,
    observacoes: r.observacoes,
    impostoPercentualManual: r.imposto_percentual_manual,
  }));

  const saidasRows: ContaPagarRow[] = (saidas ?? []).map((s) => ({
    id: s.id,
    dataPagamento: s.data_pagamento,
    descricao: s.descricao,
    valor: s.valor,
    responsavel: s.responsavel,
  }));

  return (
    <FaturamentoHortolandiaPageClient
      rowsIniciais={rows}
      saidasIniciais={saidasRows}
      anoInicial={ano}
      mesInicial={mes}
      impostoInicial={imposto?.percentual ?? null}
      impostosPorMesInicial={impostosPorMesInicial}
    />
  );
}
