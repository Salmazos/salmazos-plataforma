import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface AvisoRow {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  funcionario_id: string | null;
  created_at: string;
}

// Espelha /api/rescisoes/avisos-hoje — mesmo mecanismo de popup de login (checar "hoje"
// com obterDataHojeBrasil, "já visto" com upsert em tabela unique por usuário+dia), só
// trocando a origem do conteúdo (avisos de ASO periódico em vez de rescisão) e a tabela de
// dedup (funcionario_aso_popup_visualizacoes, própria e separada).
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
    .select("id, tipo, titulo, mensagem, funcionario_id, created_at")
    .eq("user_id", user.id)
    .like("tipo", "aso_periodico_%")
    .order("created_at", { ascending: false })
    .limit(50);

  if (errNotificacoes) return NextResponse.json({ error: errNotificacoes.message }, { status: 500 });

  const avisosHoje = ((recentesRaw ?? []) as AvisoRow[]).filter(
    (n) => new Date(n.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === hojeISO
  );

  const { data: visto } = await svc
    .from("funcionario_aso_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  return NextResponse.json({ data: avisosHoje, ja_visto: !!visto });
}
