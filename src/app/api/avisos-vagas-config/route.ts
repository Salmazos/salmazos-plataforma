import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelSuperuser(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const eventos = ["vaga_criada", "solicitacao_vaga", "vaga_fechada", "vaga_cancelada", "vaga_reativada"] as const;

  const [{ data: configsData }, { data: emailDestinatarios }, { data: plataformaDestinatarios }, { data: usuarios }] =
    await Promise.all([
      svc.from("aviso_vaga_config").select("evento, email_ativo"),
      svc.from("aviso_vaga_email_destinatarios").select("*").order("nome"),
      svc.from("aviso_vaga_plataforma_destinatarios").select("*").order("criado_em"),
      svc.from("analistas_perfil").select("user_id, nome_completo, email").eq("ativo", true).order("nome_completo"),
    ]);

  const configs = new Map((configsData ?? []).map((c) => [c.evento, c.email_ativo]));
  const perfilPorUserId = new Map((usuarios ?? []).map((u) => [u.user_id, u]));

  const resultado = eventos.map((evento) => ({
    evento,
    email_ativo: configs.get(evento) ?? true,
    email_destinatarios: (emailDestinatarios ?? []).filter((d) => d.evento === evento),
    plataforma_destinatarios: (plataformaDestinatarios ?? [])
      .filter((d) => d.evento === evento)
      .map((d) => ({
        ...d,
        analistas_perfil: perfilPorUserId.get(d.usuario_id) ?? null,
      })),
  }));

  return NextResponse.json({ data: resultado });
}
