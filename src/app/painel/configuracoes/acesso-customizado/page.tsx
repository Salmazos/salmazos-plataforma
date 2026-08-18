import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ABAS_CONFIG } from "@/lib/abasConfig";
import { acessoPadraoPorPapel } from "@/lib/regraPadraoPorPapel";
import AcessoCustomizadoConfigClient, { type AnalistaRow, type ExcecaoInicial } from "@/components/AcessoCustomizadoConfigClient";

export const dynamic = "force-dynamic";

export default async function AcessoCustomizadoConfigPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  // Restrita a superuser, mesmo padrão do resto do grupo Configurações — esta tela em si
  // decide acesso a tudo mais, então não pode ser gerenciada por quem não é superuser.
  if (role !== "superuser") redirect("/painel");

  const svc = createServiceClient();
  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo, email, cargo, nivel_acesso")
    .eq("ativo", true)
    .order("nome_completo");

  const { data: excecoes } = await svc
    .from("usuario_acesso_customizado")
    .select("analista_perfil_id, chave_aba, liberado");

  const rows: AnalistaRow[] = (analistas ?? []).map((a) => ({
    analistaPerfilId: a.id,
    nomeCompleto: a.nome_completo,
    email: a.email,
    cargo: a.cargo,
    nivelAcesso: a.nivel_acesso,
  }));

  const excecoesIniciais: ExcecaoInicial[] = (excecoes ?? []).map((e) => ({
    analistaPerfilId: e.analista_perfil_id,
    chaveAba: e.chave_aba,
    liberado: e.liberado,
  }));

  // Calculado aqui (server component) porque acessoPadraoPorPapel importa PAPEIS_FULL_ACCESS/
  // PAPEIS_PAINEL_*, que puxam createServiceClient (next/headers) na cadeia de import —
  // inválido dentro do componente cliente da matriz.
  const regraPadrao: Record<string, boolean> = {};
  for (const a of rows) {
    for (const aba of ABAS_CONFIG) {
      regraPadrao[`${a.analistaPerfilId}::${aba.chave}`] = acessoPadraoPorPapel(aba.chave, a.nivelAcesso);
    }
  }

  return (
    <AcessoCustomizadoConfigClient
      analistasIniciais={rows}
      abas={ABAS_CONFIG}
      excecoesIniciais={excecoesIniciais}
      regraPadrao={regraPadrao}
    />
  );
}
