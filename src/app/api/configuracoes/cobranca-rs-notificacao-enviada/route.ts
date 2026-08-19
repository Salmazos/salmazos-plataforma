import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

// Lista todos os analistas ativos + se estão marcados como destinatários do popup de
// "Cobrança R&S enviada". A página em si (server component) já faz essa mesma consulta
// direto pro render inicial — esta rota existe como superfície de API própria, mesmo padrão
// REST das outras telas de configuração do projeto.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const gate = checarPapelSuperuser(user);
  if (gate) return gate;

  const svc = createServiceClient();

  const { data: analistas, error } = await svc
    .from("analistas_perfil")
    .select("id, nome_completo, email, cargo, nivel_acesso")
    .eq("ativo", true)
    .order("nome_completo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: destinatarios } = await svc
    .from("cobranca_rs_destinatarios_popup_enviada")
    .select("analista_perfil_id, ativo");

  const ativoPorAnalista = new Map((destinatarios ?? []).map((d) => [d.analista_perfil_id, d.ativo]));

  const data = (analistas ?? []).map((a) => ({
    analistaPerfilId: a.id,
    nomeCompleto: a.nome_completo,
    email: a.email,
    cargo: a.cargo,
    nivelAcesso: a.nivel_acesso,
    recebeNotificacao: ativoPorAnalista.get(a.id) ?? false,
  }));

  return NextResponse.json({ data });
}
