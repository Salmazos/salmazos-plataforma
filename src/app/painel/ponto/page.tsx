import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarPonto } from "@/lib/pontoAuth";
import PontoPageClient from "@/components/PontoPageClient";

export const dynamic = "force-dynamic";

export default async function PontoPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarPonto(user))) redirect("/painel");

  const svc = createServiceClient();
  const { data: clientes } = await svc.from("clientes").select("id, nome").eq("ativo", true).order("nome");

  return <PontoPageClient clientes={clientes ?? []} />;
}
