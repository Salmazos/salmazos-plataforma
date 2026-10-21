import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeAcessarPropostas } from "@/lib/propostasAcesso";
import PropostaDetalheClient from "@/components/propostas/PropostaDetalheClient";

export const dynamic = "force-dynamic";

export default async function PropostaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarPropostas(user))) redirect("/painel");

  const { id } = await params;
  return <PropostaDetalheClient id={id} />;
}
