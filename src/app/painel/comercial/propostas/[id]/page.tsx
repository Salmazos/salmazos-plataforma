import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeAcessarFunilComercial } from "@/lib/comercial";
import PropostaDetalheClient from "@/components/propostas/PropostaDetalheClient";

export const dynamic = "force-dynamic";

export default async function PropostaDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarFunilComercial(user))) redirect("/painel");

  const { id } = await params;
  const { aviso } = await searchParams;
  return <PropostaDetalheClient id={id} avisoInicial={aviso ?? null} />;
}
