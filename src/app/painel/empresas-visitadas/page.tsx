import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import EmpresasVisitadasClient from "@/components/EmpresasVisitadasClient";
import { podeAcessarCarteiraClientes } from "@/lib/comercialAuth";
import { resolverContextoComercial } from "@/lib/comercial";

export const dynamic = "force-dynamic";

export default async function EmpresasVisitadasPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarCarteiraClientes(user))) redirect("/painel");

  const svc = createServiceClient();
  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo")
    .eq("ativo", true)
    .order("nome_completo");

  // Ler a Carteira exige o acesso acima; escrever (contatos, registros) exige perfil de vendedor.
  const ctxComercial = await resolverContextoComercial(user);

  return <EmpresasVisitadasClient analistas={analistas ?? []} podeEscrever={ctxComercial?.vendedor === true} />;
}
