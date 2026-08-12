import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import RescisoesPageClient from "@/components/RescisoesPageClient";
import { PAPEIS_PAINEL_FUNCIONARIOS } from "@/lib/funcionariosAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

export default async function RescisoesPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_FUNCIONARIOS.includes(role)) redirect("/painel");
  const isFullAccess = PAPEIS_FULL_ACCESS.includes(role);

  const svc = createServiceClient();

  const [{ data: rescisoes }, { data: clientes }] = await Promise.all([
    svc
      .from("rescisoes")
      .select("*, funcionarios(nome_completo, cargo)")
      .order("data_desligamento", { ascending: false }),
    svc.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return (
    <RescisoesPageClient
      rescisoesIniciais={rescisoes ?? []}
      clientes={clientes ?? []}
      isFullAccess={isFullAccess}
    />
  );
}
