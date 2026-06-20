import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SlaConfigLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (!["superuser", "diretoria"].includes(role)) redirect("/painel");
  return <>{children}</>;
}
