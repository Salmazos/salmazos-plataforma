import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import EmpresasVisitadasClient from "@/components/EmpresasVisitadasClient";
import { podeAcessarCarteiraClientes } from "@/lib/comercialAuth";

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

  return <EmpresasVisitadasClient analistas={analistas ?? []} />;
}
