import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Tela antiga (tabelas rescisao_avisos_* e chave rescisao_avisos_email_ativo): os avisos agora são configurados em Configurações > Avisos. A rota de API e as tabelas
// antigas continuam existindo; só o acesso é encaminhado para a tela unificada.
export default async function RescisoesAvisosConfigMovidaPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (role !== "superuser") redirect("/painel");

  redirect("/painel/avisos-config");
}
