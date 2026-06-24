import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import ReembolsosPageClient from "@/components/ReembolsosPageClient";

export const dynamic = "force-dynamic";

export default async function ReembolsosPage() {
  const supabaseAuth = await createClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
  const role = authUser?.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria"].includes(role)) redirect("/painel");

  const supabase = createServiceClient();
  const { data: analistas } = await supabase
    .from("analistas_perfil")
    .select("id, nome_completo, avatar_url, cargo")
    .eq("ativo", true)
    .order("nome_completo");

  return <ReembolsosPageClient analistas={analistas ?? []} />;
}
