import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import EmpresasVisitadasClient from "@/components/EmpresasVisitadasClient";

export const dynamic = "force-dynamic";

export default async function EmpresasVisitadasPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria", "supervisor"].includes(role)) redirect("/painel");

  const svc = createServiceClient();
  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo")
    .eq("ativo", true)
    .order("nome_completo");

  return <EmpresasVisitadasClient analistas={analistas ?? []} />;
}
