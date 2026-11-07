import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolverAcessoComissoes } from "@/lib/comissaoAuth";
import ComissoesDiretoriaClient from "@/components/comissao/ComissoesDiretoriaClient";

export const dynamic = "force-dynamic";

export default async function ComissoesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const acesso = await resolverAcessoComissoes(user);
  if (!acesso.diretoria) redirect("/painel");
  return <ComissoesDiretoriaClient mesInicialProp={mes} />;
}
