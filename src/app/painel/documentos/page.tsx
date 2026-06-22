import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import DocumentosPageClient from "@/components/DocumentosPageClient";

export const dynamic = "force-dynamic";

export default async function DocumentosPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  const isFullAccess = ["superuser", "diretoria"].includes(role);
  const isSupervisorOrAbove = ["superuser", "diretoria", "supervisor"].includes(role);

  const supabase = createServiceClient();

  const [{ data: clientes }, { data: perfil }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("analistas_perfil")
      .select("id")
      .eq("user_id", user.id)
      .single(),
  ]);

  return (
    <DocumentosPageClient
      clientes={clientes ?? []}
      isFullAccess={isFullAccess}
      isSupervisorOrAbove={isSupervisorOrAbove}
      analistaId={perfil?.id ?? null}
    />
  );
}
