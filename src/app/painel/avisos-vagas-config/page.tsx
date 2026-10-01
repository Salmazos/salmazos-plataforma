import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AvisosVagasConfigClient from "@/components/AvisosVagasConfigClient";

export const dynamic = "force-dynamic";

export default async function AvisosVagasConfigPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (role !== "superuser") redirect("/painel");

  const svc = createServiceClient();

  const [{ data: configsData }, { data: emailDestinatarios }, { data: plataformaDestinatariosRaw }, { data: usuarios }] =
    await Promise.all([
      svc.from("aviso_vaga_config").select("evento, email_ativo"),
      svc.from("aviso_vaga_email_destinatarios").select("*").order("nome"),
      svc.from("aviso_vaga_plataforma_destinatarios").select("*").order("criado_em"),
      svc.from("analistas_perfil").select("user_id, nome_completo, email").eq("ativo", true).order("nome_completo"),
    ]);

  const configs = new Map((configsData ?? []).map((c) => [c.evento, c.email_ativo]));
  const nomePorUserId = new Map((usuarios ?? []).map((u) => [u.user_id, u.nome_completo]));
  const plataformaDestinatarios = (plataformaDestinatariosRaw ?? []).map((d) => ({
    ...d,
    nome_completo: nomePorUserId.get(d.usuario_id) ?? "Usuário removido",
  }));

  const eventos = ["vaga_criada", "solicitacao_vaga", "vaga_fechada", "vaga_cancelada", "vaga_reativada"] as const;

  const configsPorEvento = eventos.reduce(
    (acc, evento) => ({
      ...acc,
      [evento]: {
        email_ativo: configs.get(evento) ?? true,
        email_destinatarios: (emailDestinatarios ?? []).filter((d) => d.evento === evento),
        plataforma_destinatarios: (plataformaDestinatarios ?? []).filter((d) => d.evento === evento),
      },
    }),
    {} as Record<(typeof eventos)[number], { email_ativo: boolean; email_destinatarios: any[]; plataforma_destinatarios: any[] }>
  );

  return (
    <AvisosVagasConfigClient configsPorEvento={configsPorEvento} usuarios={usuarios ?? []} />
  );
}
