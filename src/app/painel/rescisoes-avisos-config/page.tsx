import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import RescisoesAvisosConfigClient from "@/components/RescisoesAvisosConfigClient";

export const dynamic = "force-dynamic";

export default async function RescisoesAvisosConfigPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (role !== "superuser") redirect("/painel");

  const svc = createServiceClient();

  const [{ data: emailDestinatarios }, { data: plataformaDestinatariosRaw }, { data: usuarios }] = await Promise.all([
    svc.from("rescisao_avisos_email_destinatarios").select("*").order("nome"),
    svc.from("rescisao_avisos_plataforma_destinatarios").select("*").order("criado_em"),
    svc.from("analistas_perfil").select("user_id, nome_completo, email").eq("ativo", true).order("nome_completo"),
  ]);

  // Sem FK direta entre rescisao_avisos_plataforma_destinatarios e analistas_perfil (as
  // duas só referenciam auth.users separadamente) — resolve o nome aqui em vez de um
  // embed do PostgREST, que não existe pra esse relacionamento.
  const nomePorUserId = new Map((usuarios ?? []).map((u) => [u.user_id, u.nome_completo]));
  const plataformaDestinatarios = (plataformaDestinatariosRaw ?? []).map((d) => ({
    ...d,
    nome_completo: nomePorUserId.get(d.usuario_id) ?? "Usuário removido",
  }));

  return (
    <RescisoesAvisosConfigClient
      emailDestinatariosIniciais={emailDestinatarios ?? []}
      plataformaDestinatariosIniciais={plataformaDestinatarios}
      usuarios={usuarios ?? []}
    />
  );
}
