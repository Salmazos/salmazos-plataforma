import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { popupsDecisaoLigados } from "@/lib/avisarDecisaoClienteCandidato";
import { inicioJanelaPopupDecisao, tiposComPopupLigado, type DecisaoPopupItem } from "@/lib/decisaoClienteCandidato";

export const dynamic = "force-dynamic";

// Popup "Decisões do cliente" (o cliente aprovou/reprovou um candidato), lido UMA vez ao entrar no painel (sem
// polling). Só mostra avisos NOMINAIS do próprio usuário (user_id = quem está logado, vindo da sessão; a linha
// geral da unidade nunca gera popup) dos últimos 30 dias que ele ainda não viu (notificacao_popup_vistos), e só
// dos eventos cujo canal popup está ligado em Configurações > Avisos (sem linha ou erro de leitura = não mostra).
// Quem aparece é o responsável do candidato e a lista do sino: o popup não tem lista própria.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const vazio = () => NextResponse.json({ data: [], temNovas: false });

  const tipos = tiposComPopupLigado(await popupsDecisaoLigados(svc));
  if (tipos.length === 0) return vazio();

  const { data, error } = await svc
    .from("notificacoes_analista")
    .select("id, tipo, titulo, mensagem, candidato_id, created_at")
    .eq("user_id", user.id)
    .in("tipo", tipos)
    .gte("created_at", inicioJanelaPopupDecisao())
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
  // Sem conseguir ler o "visto" (tabela ainda não criada, por exemplo), não abre: melhor calar do que repetir.
  if (erroVistos) {
    console.error("[GET /api/decisoes-cliente-popup] Erro ao ler os avisos já vistos:", erroVistos.message);
    return vazio();
  }
  const jaVistos = new Set((vistos ?? []).map((v: { notificacao_id: string }) => v.notificacao_id));

  const itens: DecisaoPopupItem[] = avisos
    .filter((a) => !jaVistos.has(a.id))
    .map((a) => ({ id: a.id, tipo: a.tipo, titulo: a.titulo, mensagem: a.mensagem, candidatoId: a.candidato_id ?? null, createdAt: a.created_at }));
  return NextResponse.json({ data: itens, temNovas: itens.length > 0 });
}
