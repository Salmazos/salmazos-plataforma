import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolverContextoPropostas } from "@/lib/propostasAcesso";
import PropostaNovaClient from "@/components/propostas/PropostaNovaClient";

export const dynamic = "force-dynamic";

export default async function NovaPropostaPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await resolverContextoPropostas(user);
  if (!ctx) redirect("/painel");
  // Cria quem tem perfil comercial ou liberação individual; quem só acompanha (ex.: diretoria sem liberação) é redirecionado.
  if (!ctx.podeEscrever) redirect("/painel/comercial/propostas");

  const { data: perfil } = await createServiceClient().from("analistas_perfil").select("nome_completo").eq("id", ctx.analistaId).maybeSingle();
  return <PropostaNovaClient meuNome={perfil?.nome_completo ?? ""} />;
}
