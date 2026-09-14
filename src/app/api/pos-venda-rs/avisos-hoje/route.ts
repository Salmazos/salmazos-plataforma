import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface AvisoRow {
  id: string;
  titulo: string;
  mensagem: string;
  candidato_id: string | null;
  created_at: string;
}

// Mesmo mecanismo de PopupRescisoesHoje/avisos-hoje: conteúdo já decidido no cron
// (api/cron/pos-venda-rs), aqui só filtra "hoje" (por usuário, via notificacoes_analista
// já targetada por user_id) e checa se esse usuário já viu o popup hoje.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const hojeISO = formatarDataISO(obterDataHojeBrasil());

  const { data: recentesRaw, error } = await svc
    .from("notificacoes_analista")
    .select("id, titulo, mensagem, candidato_id, created_at")
    .eq("user_id", user.id)
    .eq("tipo", "pos_venda_rs")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const avisosHoje = ((recentesRaw ?? []) as AvisoRow[]).filter(
    (n) => new Date(n.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === hojeISO
  );

  const { data: visto } = await svc
    .from("pos_venda_rs_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  return NextResponse.json({ data: avisosHoje, ja_visto: !!visto });
}
