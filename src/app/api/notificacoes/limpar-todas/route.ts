import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Marca como lida toda notificação visível pro usuário autenticado — mesma distinção de
// /api/notificacoes/[id]/route.ts: direcionada (user_id próprio) atualiza `lida` direto;
// broadcast (user_id null) não pode ter a linha compartilhada alterada (marcaria "lida" pra
// todo mundo), então cada leitura vira uma linha própria em notificacao_leituras.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { error: erroDirecionadas } = await svc
    .from("notificacoes_analista")
    .update({ lida: true })
    .eq("user_id", user.id)
    .eq("lida", false);
  if (erroDirecionadas) return NextResponse.json({ error: erroDirecionadas.message }, { status: 500 });

  const { data: broadcasts, error: erroBroadcasts } = await svc
    .from("notificacoes_analista")
    .select("id")
    .is("user_id", null);
  if (erroBroadcasts) return NextResponse.json({ error: erroBroadcasts.message }, { status: 500 });

  const idsBroadcast = (broadcasts ?? []).map((n) => n.id);
  if (idsBroadcast.length > 0) {
    const { error: erroLeituras } = await svc
      .from("notificacao_leituras")
      .upsert(
        idsBroadcast.map((notificacao_id) => ({ notificacao_id, user_id: user.id })),
        { onConflict: "notificacao_id,user_id", ignoreDuplicates: true }
      );
    if (erroLeituras) return NextResponse.json({ error: erroLeituras.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
