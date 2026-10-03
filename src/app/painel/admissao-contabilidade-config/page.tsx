import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AdmissaoContabilidadeConfigClient from "@/components/AdmissaoContabilidadeConfigClient";
import { obterRemetente } from "@/lib/sendEmail";

export const dynamic = "force-dynamic";

export default async function AdmissaoContabilidadeConfigPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (role !== "superuser") redirect("/painel");

  const svc = createServiceClient();
  const { data: destinatarios } = await svc.from("admissao_contabilidade_email_destinatarios").select("*").order("nome");

  return (
    <AdmissaoContabilidadeConfigClient
      destinatariosIniciais={destinatarios ?? []}
      remetente={obterRemetente("contabilidade")}
    />
  );
}
