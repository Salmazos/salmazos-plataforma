import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import ComercialClient from "@/components/ComercialClient";
import { resolverContextoComercial } from "@/lib/comercial";

export const dynamic = "force-dynamic";

export default async function ComercialPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await resolverContextoComercial(user);
  if (!ctx) redirect("/painel");

  // Gestor escolhe o vendedor no filtro; vendedor não precisa da lista.
  let vendedores: { id: string; nome_completo: string; unidade_nome: string | null }[] = [];
  if (ctx.gestor) {
    const svc = createServiceClient();
    let q = svc
      .from("analistas_perfil")
      .select("id, nome_completo, unidade_id")
      .eq("ativo", true)
      .eq("perfil_comercial", true)
      .order("nome_completo");
    if (!ctx.todasUnidades && ctx.unidadeId) q = q.eq("unidade_id", ctx.unidadeId);
    const [{ data: perfis }, { data: unidades }] = await Promise.all([q, svc.from("unidades").select("id, nome")]);
    const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
    vendedores = (perfis ?? []).map((p) => ({
      id: p.id,
      nome_completo: p.nome_completo,
      unidade_nome: p.unidade_id ? nomeUnidade.get(p.unidade_id) ?? null : null,
    }));
  }

  return <ComercialClient vendedor={ctx.vendedor} gestor={ctx.gestor} meuAnalistaId={ctx.analistaId} vendedores={vendedores} />;
}
