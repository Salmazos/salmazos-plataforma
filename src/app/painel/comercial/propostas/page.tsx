import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolverContextoComercial } from "@/lib/comercial";
import PropostasListaClient from "@/components/propostas/PropostasListaClient";

export const dynamic = "force-dynamic";

export default async function PropostasPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await resolverContextoComercial(user);
  if (!ctx) redirect("/painel");

  // O gestor escolhe o vendedor no filtro; o vendedor não precisa da lista.
  let vendedores: { id: string; nome_completo: string }[] = [];
  if (ctx.gestor) {
    const svc = createServiceClient();
    let q = svc.from("analistas_perfil").select("id, nome_completo").eq("ativo", true).eq("perfil_comercial", true).order("nome_completo");
    if (!ctx.todasUnidades && ctx.unidadeId) q = q.eq("unidade_id", ctx.unidadeId);
    vendedores = (await q).data ?? [];
  }

  return <PropostasListaClient podeCriar={ctx.vendedor} gestor={ctx.gestor} vendedores={vendedores} />;
}
