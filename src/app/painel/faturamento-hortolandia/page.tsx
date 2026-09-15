import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
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
  const { data } = await svc
    .from("contas_receber_hortolandia")
    .select("*, clientes(id, nome)")
    .order("data_vencimento", { ascending: true });

  const rows: ContaReceberRow[] = (data ?? []).map((r) => ({
    id: r.id,
    clienteId: r.cliente_id,
    clienteNome: (Array.isArray(r.clientes) ? r.clientes[0]?.nome : r.clientes?.nome) ?? "—",
    numeroNf: r.numero_nf,
    valorBruto: r.valor_bruto,
    valorLiquido: r.valor_liquido,
    dataVencimento: r.data_vencimento,
    dataPagamento: r.data_pagamento,
    dataEmissaoNf: r.data_emissao_nf,
    status: r.status,
    observacoes: r.observacoes,
  }));

  return <FaturamentoHortolandiaPageClient rowsIniciais={rows} />;
}
