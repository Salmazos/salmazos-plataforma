import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolverContextoComercial } from "@/lib/comercial";
import PropostaNovaClient from "@/components/propostas/PropostaNovaClient";

export const dynamic = "force-dynamic";

export default async function NovaPropostaPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await resolverContextoComercial(user);
  if (!ctx) redirect("/painel");
  // Só quem tem perfil comercial cria; a diretoria sem esse perfil apenas acompanha.
  if (!ctx.vendedor) redirect("/painel/comercial/propostas");

  const { data: perfil } = await createServiceClient().from("analistas_perfil").select("nome_completo").eq("id", ctx.analistaId).maybeSingle();
  return <PropostaNovaClient meuNome={perfil?.nome_completo ?? ""} />;
}
