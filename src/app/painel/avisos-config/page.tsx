import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AvisosConfigClient from "@/components/AvisosConfigClient";

export const dynamic = "force-dynamic";

export default async function AvisosConfigPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (role !== "superuser") redirect("/painel");

  return <AvisosConfigClient />;
}
