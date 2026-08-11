import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FaturamentoRSPageClient from "@/components/FaturamentoRSPageClient";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import { obterReceitaMes } from "@/lib/faturamentoRS";

export const dynamic = "force-dynamic";

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
  const dadosIniciais = await obterReceitaMes(svc, ano, mes);

  return <FaturamentoRSPageClient anoInicial={ano} mesInicial={mes} dadosIniciais={dadosIniciais} />;
}
