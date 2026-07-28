import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FuncionariosPageClient from "@/components/FuncionariosPageClient";
import { PAPEIS_PAINEL_FUNCIONARIOS } from "@/lib/funcionariosAuth";

export const dynamic = "force-dynamic";

export default async function FuncionariosPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_FUNCIONARIOS.includes(role)) redirect("/painel");

  const svc = createServiceClient();

  const [{ data: funcionarios }, { data: clientes }] = await Promise.all([
    svc.from("funcionarios").select("*, clientes(nome)").order("criado_em", { ascending: false }),
    svc.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return (
    <FuncionariosPageClient
      funcionariosIniciais={funcionarios ?? []}
      clientes={clientes ?? []}
    />
  );
}
