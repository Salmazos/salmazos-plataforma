import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import FaturamentoHortolandiaPageClient, {
  type ContaReceberRow,
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

  const [{ data }, { data: imposto }] = await Promise.all([
    svc
      .from("contas_receber_hortolandia")
      .select("*, clientes(id, nome)")
      .order("data_vencimento", { ascending: true }),
    svc
      .from("faturamento_hortolandia_impostos_mensais")
      .select("ano, mes, percentual, atualizado_em")
      .eq("ano", ano)
      .eq("mes", mes)
      .maybeSingle(),
  ]);

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
  }));

  return (
    <FaturamentoHortolandiaPageClient
      rowsIniciais={rows}
      anoInicial={ano}
      mesInicial={mes}
      impostoInicial={imposto?.percentual ?? null}
    />
  );
}
