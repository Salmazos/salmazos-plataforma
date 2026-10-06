import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Tela antiga (tabela cobranca_rs_avisos_destinatarios, que o código dos avisos já não lia): os avisos da Cobrança R&S
// agora são configurados em Configurações > Avisos (grupo Vagas, eventos cobranca_rs_*). A rota e a tabela continuam
// existindo; só o acesso é encaminhado para a tela unificada.
export default async function CobrancaRSAvisosConfigMovidaPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (role !== "superuser") redirect("/painel");

  redirect("/painel/avisos-config");
}
