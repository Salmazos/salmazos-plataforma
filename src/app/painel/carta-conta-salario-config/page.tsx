import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CartaContaSalarioConfigClient from "@/components/CartaContaSalarioConfigClient";

export const dynamic = "force-dynamic";

export default async function CartaContaSalarioConfigPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role !== "superuser") redirect("/painel");

  const svc = createServiceClient();
  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("user_id, nome_completo, assinatura_url")
    .eq("ativo", true)
    .order("nome_completo");

  return <CartaContaSalarioConfigClient analistas={analistas ?? []} />;
}
