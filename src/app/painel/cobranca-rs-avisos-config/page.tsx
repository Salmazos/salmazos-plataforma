import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CobrancaRSAvisosConfigClient from "@/components/CobrancaRSAvisosConfigClient";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

export default async function CobrancaRSAvisosConfigPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) redirect("/painel");

  const svc = createServiceClient();
  const { data: emailDestinatarios } = await svc
    .from("cobranca_rs_avisos_destinatarios")
    .select("*")
    .order("nome");

  return <CobrancaRSAvisosConfigClient emailDestinatariosIniciais={emailDestinatarios ?? []} />;
}
