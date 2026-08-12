import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EmailLogsPageClient from "@/components/EmailLogsPageClient";

export const dynamic = "force-dynamic";

// Gate de servidor adicionado junto com a restrição do grupo "Configurações" a superuser no
// menu (SidebarMenu.tsx) — antes desta correção a página não tinha nenhuma verificação
// própria (só "use client" sem redirect), dependia inteiramente do menu escondido + das
// rotas de API. Mesmo padrão de /painel/usuarios e /painel/audit-logs.
export default async function EmailLogsPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";

  if (role !== "superuser") redirect("/painel");

  return <EmailLogsPageClient />;
}
