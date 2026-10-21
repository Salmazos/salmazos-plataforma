import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { listarQuemPodeEscreverPropostas, resolverContextoPropostas } from "@/lib/propostasAcesso";
import PropostasListaClient from "@/components/propostas/PropostasListaClient";

export const dynamic = "force-dynamic";

export default async function PropostasPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await resolverContextoPropostas(user);
  if (!ctx) redirect("/painel");

  // O gestor escolhe o vendedor no filtro (quem pode escrever em Propostas); o vendedor não precisa da lista.
  const vendedores = ctx.gestor ? await listarQuemPodeEscreverPropostas(createServiceClient(), ctx) : [];

  return <PropostasListaClient podeCriar={ctx.podeEscrever} gestor={ctx.gestor} vendedores={vendedores} />;
}
