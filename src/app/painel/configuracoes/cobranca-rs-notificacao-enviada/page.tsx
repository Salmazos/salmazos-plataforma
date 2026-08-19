import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CobrancaRSNotificacaoEnviadaConfigClient, {
  type AnalistaNotificacaoRow,
} from "@/components/CobrancaRSNotificacaoEnviadaConfigClient";

export const dynamic = "force-dynamic";

export default async function CobrancaRSNotificacaoEnviadaConfigPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  // Restrita a superuser, mesmo padrão de cobranca-rs-acesso-config.
  if (role !== "superuser") redirect("/painel");

  const svc = createServiceClient();

  // Diferente de cobranca-rs-acesso-config (só lista analista/supervisor, porque diretoria/
  // superuser já têm acesso automático via PAPEIS_FULL_ACCESS e não precisam aparecer aqui):
  // este popup não inclui ninguém automaticamente — qualquer papel, inclusive diretoria/
  // superuser, precisa ser marcado aqui pra receber a notificação. Por isso lista todos os
  // analistas_perfil ativos, sem filtrar por nivel_acesso.
  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo, email, cargo, nivel_acesso")
    .eq("ativo", true)
    .order("nome_completo");

  const { data: destinatarios } = await svc
    .from("cobranca_rs_destinatarios_popup_enviada")
    .select("analista_perfil_id, ativo");

  const ativoPorAnalista = new Map((destinatarios ?? []).map((d) => [d.analista_perfil_id, d.ativo]));

  const rows: AnalistaNotificacaoRow[] = (analistas ?? []).map((a) => ({
    analistaPerfilId: a.id,
    nomeCompleto: a.nome_completo,
    email: a.email,
    cargo: a.cargo,
    nivelAcesso: a.nivel_acesso,
    recebeNotificacao: ativoPorAnalista.get(a.id) ?? false,
  }));

  return <CobrancaRSNotificacaoEnviadaConfigClient analistasIniciais={rows} />;
}
