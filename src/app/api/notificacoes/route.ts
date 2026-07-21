import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("notificacoes_analista")
    .select("*")
    // user_id nulo = notificação de broadcast (ex: nova solicitação de vaga,
    // atualização de currículo), visível a todos; as demais são direcionadas
    // a um analista específico e usam a coluna `lida` normalmente.
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notificação de broadcast é uma linha só compartilhada por todo mundo — não dá
  // pra guardar "lida" nela (marcar como lida pra um analista marcaria pra todos).
  // Cada leitura de broadcast vira uma linha própria em notificacao_leituras;
  // aqui computamos, por notificação, se ESTE usuário já tem uma leitura registrada.
  const idsBroadcast = (data ?? []).filter((n) => n.user_id === null).map((n) => n.id);
  let lidasBroadcast = new Set<string>();
  if (idsBroadcast.length > 0) {
    const { data: leituras } = await svc
      .from("notificacao_leituras")
      .select("notificacao_id")
      .eq("user_id", user.id)
      .in("notificacao_id", idsBroadcast);
    lidasBroadcast = new Set((leituras ?? []).map((l) => l.notificacao_id));
  }

  const resultado = (data ?? []).map((n) =>
    n.user_id === null ? { ...n, lida: lidasBroadcast.has(n.id) } : n
  );

  return NextResponse.json({ data: resultado });
}
