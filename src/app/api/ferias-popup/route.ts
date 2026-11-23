import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { EVENTO_FERIAS_VENCIMENTO } from "@/lib/avisosCatalogo";
import { TIPO_NOTIFICACAO_FERIAS } from "@/lib/feriasAvisos";

export const dynamic = "force-dynamic";

// Janela de dias em que um aviso ainda não visto pode abrir o popup (depois disso só o sino guarda o aviso).
const JANELA_DIAS = 14;

export interface FeriasPopupItem {
  id: string;
  titulo: string;
  mensagem: string;
  funcionarioId: string | null;
  createdAt: string;
}

// Popup dos avisos de férias a vencer, lido UMA vez ao entrar no painel (sem polling). Mesmo padrão do popup de decisão do cliente: só avisos NOMINAIS
// do próprio usuário (quem recebeu o aviso do sino), dos últimos 14 dias, que ele ainda não viu (notificacao_popup_vistos, uma vez por aviso por pessoa),
// e só com o canal popup do evento ligado em Configurações > Avisos (sem linha ou erro de leitura = não mostra; nunca quebra o painel).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const vazio = () => NextResponse.json({ data: [], temNovas: false });

  const { data: canal, error: erroCanal } = await svc.from("aviso_eventos_canais").select("ativo").eq("evento", EVENTO_FERIAS_VENCIMENTO).eq("canal", "popup").maybeSingle();
  if (erroCanal) {
    console.error("[GET /api/ferias-popup] Erro ao ler o canal popup (segue desligado):", erroCanal.message);
    return vazio();
  }
  if (!canal || canal.ativo !== true) return vazio();

  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString();
  const { data, error } = await svc
    .from("notificacoes_analista")
    .select("id, titulo, mensagem, funcionario_id, created_at")
    .eq("user_id", user.id)
    .eq("tipo", TIPO_NOTIFICACAO_FERIAS)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const avisos = data ?? [];
  if (avisos.length === 0) return vazio();

  const { data: vistos, error: erroVistos } = await svc
    .from("notificacao_popup_vistos")
    .select("notificacao_id")
    .eq("user_id", user.id)
    .in("notificacao_id", avisos.map((a) => a.id));
  // Sem conseguir ler o "visto", não abre: melhor calar do que repetir.
  if (erroVistos) {
    console.error("[GET /api/ferias-popup] Erro ao ler os avisos já vistos:", erroVistos.message);
    return vazio();
  }
  const jaVistos = new Set((vistos ?? []).map((v: { notificacao_id: string }) => v.notificacao_id));

  const itens: FeriasPopupItem[] = avisos
    .filter((a) => !jaVistos.has(a.id))
    .map((a) => ({ id: a.id, titulo: a.titulo, mensagem: a.mensagem, funcionarioId: a.funcionario_id ?? null, createdAt: a.created_at }));
  return NextResponse.json({ data: itens, temNovas: itens.length > 0 });
}
