import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelSuperuser } from "@/lib/fullAccessAuth";

export const dynamic = "force-dynamic";

// Mesmo padrão de /api/configuracoes/cobranca-rs-notificacao-enviada, lista separada
// (cobranca_rs_destinatarios_popup_vencida) — quem recebe o popup de "Fatura vencida".
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
    .from("cobranca_rs_destinatarios_popup_vencida")
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
