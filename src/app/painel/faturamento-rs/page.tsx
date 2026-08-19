import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FaturamentoRSPageClient from "@/components/FaturamentoRSPageClient";
import { podeAcessarFaturamentoRs } from "@/lib/faturamentoRsAuth";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import { obterReceitaMes } from "@/lib/faturamentoRS";

export const dynamic = "force-dynamic";

export default async function FaturamentoRSPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarFaturamentoRs(user))) redirect("/painel");

  const hoje = obterDataHojeBrasil();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const svc = createServiceClient();
  const dadosIniciais = await obterReceitaMes(svc, ano, mes);

  return <FaturamentoRSPageClient anoInicial={ano} mesInicial={mes} dadosIniciais={dadosIniciais} />;
}
