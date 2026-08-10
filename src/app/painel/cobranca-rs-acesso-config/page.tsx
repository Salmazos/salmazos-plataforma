import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CobrancaRSAcessoConfigClient, { type AnalistaAcessoRow } from "@/components/CobrancaRSAcessoConfigClient";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

export default async function CobrancaRSAcessoConfigPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  // Restrita a PAPEIS_FULL_ACCESS (não a checarAcessoCobrancaRS) — quem tem acesso à tela
  // de Cobrança R&S via lista configurável não pode se auto-gerenciar aqui.
  if (!PAPEIS_FULL_ACCESS.includes(role)) redirect("/painel");

  const svc = createServiceClient();
  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo, email, cargo, nivel_acesso")
    .in("nivel_acesso", ["analista", "supervisor"])
    .eq("ativo", true)
    .order("nome_completo");

  const { data: acessos } = await svc
    .from("cobranca_rs_analistas_acesso")
    .select("analista_perfil_id, ativo");

  const acessoPorAnalista = new Map((acessos ?? []).map((a) => [a.analista_perfil_id, a.ativo]));

  const rows: AnalistaAcessoRow[] = (analistas ?? []).map((a) => ({
    analistaPerfilId: a.id,
    nomeCompleto: a.nome_completo,
    email: a.email,
    cargo: a.cargo,
    nivelAcesso: a.nivel_acesso,
    temAcesso: acessoPorAnalista.get(a.id) ?? false,
  }));

  return <CobrancaRSAcessoConfigClient analistasIniciais={rows} />;
}
