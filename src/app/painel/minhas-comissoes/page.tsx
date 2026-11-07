import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolverAcessoComissoes } from "@/lib/comissaoAuth";
import MinhasComissoesClient from "@/components/comissao/MinhasComissoesClient";

export const dynamic = "force-dynamic";

export default async function MinhasComissoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const acesso = await resolverAcessoComissoes(user);
  if (!acesso.minhas || !acesso.beneficiario) redirect("/painel");
  return <MinhasComissoesClient nome={acesso.beneficiario.nome_completo} percentual={acesso.beneficiario.percentual} />;
}
