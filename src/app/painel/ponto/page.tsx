import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarPonto } from "@/lib/pontoAuth";
import PontoPageClient from "@/components/PontoPageClient";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";

export const dynamic = "force-dynamic";

export default async function PontoPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarPonto(user))) redirect("/painel");

  // Supervisor só importa/vê ponto de cliente da própria unidade (RH por unidade, 24/09).
  const ctx = await contextoRH(user);
  if (!ctx) return <SemAcessoPainel />;

  const svc = createServiceClient();
  let clientesQuery = svc.from("clientes").select("id, nome").eq("ativo", true).order("nome");
  if (!ctx.todasUnidades) clientesQuery = clientesQuery.eq("unidade_id", ctx.unidadeId);
  const { data: clientes } = await clientesQuery;

  return <PontoPageClient clientes={clientes ?? []} />;
}
