import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: notificacao, error: fetchError } = await svc
    .from("notificacoes_analista")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (fetchError || !notificacao) {
    return NextResponse.json({ error: "Notificação não encontrada." }, { status: 404 });
  }

  if (notificacao.user_id !== null) {
    // Direcionada: só o próprio destinatário pode marcar como lida.
    if (notificacao.user_id !== user.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    const { error } = await svc
      .from("notificacoes_analista")
      .update({ lida: true })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Broadcast: a linha em notificacoes_analista é compartilhada por todo mundo,
  // então marcar "lida" ali marcaria pra todos os analistas de uma vez. A leitura
  // vira uma linha própria em notificacao_leituras, só pra esse usuário.
  // ignoreDuplicates faz DO NOTHING em cliques repetidos (não precisa de política
  // de UPDATE na tabela — só INSERT/SELECT, ver migração de notificacao_leituras).
  const { error } = await svc
    .from("notificacao_leituras")
    .upsert(
      { notificacao_id: id, user_id: user.id },
      { onConflict: "notificacao_id,user_id", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
