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
  const avisosHoje = ((recentesRaw ?? []) as AvisoRow[]).filter(
    (n) => new Date(n.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === hojeISO
  );

  const { data: visto } = await svc
    .from("rescisao_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  return NextResponse.json({ data: avisosHoje, ja_visto: !!visto });
}
