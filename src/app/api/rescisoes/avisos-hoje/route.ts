import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface AvisoRow {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  rescisao_id: string | null;
  created_at: string;
}

// Espelha /api/aniversariantes/hoje: mesmo mecanismo de popup de login (checar "hoje" com
// obterDataHojeBrasil, "já visto" com upsert em tabela unique por usuário+dia). O que muda
// é a origem do conteúdo — em vez de aniversariantes_contatos, usa as notificações de
// plataforma (notificacoes_analista) já criadas pelos 3 disparos de rescisão, filtradas
// pra hoje. Não recalcula critério de negócio (destinatário, momento etc.) de novo aqui —
// isso já foi decidido no momento em que a notificação foi inserida.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const hojeISO = formatarDataISO(obterDataHojeBrasil());

  const { data: recentesRaw, error: errNotificacoes } = await svc
    .from("notificacoes_analista")
    .select("id, tipo, titulo, mensagem, rescisao_id, created_at")
    .eq("user_id", user.id)
    .like("tipo", "rescisao_%")
    .order("created_at", { ascending: false })
    .limit(50);

  if (errNotificacoes) return NextResponse.json({ error: errNotificacoes.message }, { status: 500 });

  // Filtro de "hoje" em JS (não no SQL) comparando em America/Sao_Paulo — mesma técnica já
  // usada em portal/(app)/page.tsx pra entrevistas de hoje, evita risco de shift de fuso
  // que uma comparação de intervalo timestamptz mal calculada introduziria.
  const doDia = ((recentesRaw ?? []) as AvisoRow[]).filter(
    (n) => new Date(n.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === hojeISO
  );

  // "Vence hoje" de rescisão que já foi marcada como Pago depois do aviso sair não aparece
  // mais — o popup ficaria cobrando um pagamento que já aconteceu.
  const idsVencimento = [
    ...new Set(doDia.filter((n) => n.tipo.startsWith("rescisao_vencimento_") && n.rescisao_id).map((n) => n.rescisao_id as string)),
  ];
  let pagas = new Set<string>();
  if (idsVencimento.length > 0) {
    const { data: rescPagas } = await svc.from("rescisoes").select("id").in("id", idsVencimento).eq("faturado", true);
    pagas = new Set((rescPagas ?? []).map((r) => r.id));
  }
  const avisosHoje = doDia.filter(
    (n) => !(n.tipo.startsWith("rescisao_vencimento_") && n.rescisao_id && pagas.has(n.rescisao_id))
  );

  // "Já visto" vale só até chegar aviso novo: o de rescisão paga pode ser criado à tarde,
  // depois de o popup da manhã já ter sido fechado (marcar-visto atualiza visualizado_em).
  const { data: visto } = await svc
    .from("rescisao_popup_visualizacoes")
    .select("visualizado_em")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();
  const jaVisto = !!visto && avisosHoje.every((n) => new Date(n.created_at) <= new Date(visto.visualizado_em));

  return NextResponse.json({ data: avisosHoje, ja_visto: jaVisto });
}
