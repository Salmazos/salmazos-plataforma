import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import { EVENTO_INDICACAO_RECEBIDA } from "@/lib/avisoIndicacaoRecebida";

export const dynamic = "force-dynamic";

interface IndicacaoPendenteRow {
  id: string;
  cliente_nome: string | null;
  candidato_nome: string;
  created_at: string;
  vagas: { titulo: string } | null;
}

// Popup "Indicação Direta de Candidato", lido UMA vez ao entrar no painel (sem polling). Só
// aparece para quem está na lista do canal popup do evento indicacao_candidato_recebida
// (Configurações > Avisos) — sem configuração, falha de leitura ou canal desligado, ninguém vê:
// o popup só existe quando a configuração existe. O filtro de unidade é fixo (a lista de
// pendentes é a da unidade do usuário; sócios com acesso a todas veem todas), como em
// GET /api/solicitacoes-indicacao-candidato. Dedup por (usuário, indicação) em
// indicacao_candidato_popup_vistos: reaparece no próximo login enquanto houver pendente que o
// usuário ainda não dispensou.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const vazio = () => NextResponse.json({ data: [], temNovas: false });

  const [lista, { data: perfil }] = await Promise.all([
    resolverDestinatarios(EVENTO_INDICACAO_RECEBIDA, "popup", undefined, svc),
    svc.from("analistas_perfil").select("unidade_id, acesso_todas_unidades").eq("user_id", user.id).eq("ativo", true).maybeSingle(),
  ]);
  if (!perfil || lista.modo !== "configurado" || !lista.userIds.includes(user.id)) return vazio();

  let query = svc
    .from("solicitacoes_indicacao_candidato")
    .select("id, cliente_nome, candidato_nome, created_at, vagas(titulo)")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });
  if (perfil.acesso_todas_unidades !== true) query = query.eq("unidade_id", perfil.unidade_id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pendentes = (data ?? []) as unknown as IndicacaoPendenteRow[];
  if (pendentes.length === 0) return vazio();

  const { data: vistas } = await svc
    .from("indicacao_candidato_popup_vistos")
    .select("solicitacao_indicacao_id")
    .eq("usuario_id", user.id)
    .in("solicitacao_indicacao_id", pendentes.map((p) => p.id));
  const idsVistos = new Set((vistas ?? []).map((v: { solicitacao_indicacao_id: string }) => v.solicitacao_indicacao_id));

  return NextResponse.json({
    data: pendentes.map((p) => ({
      id: p.id,
      clienteNome: p.cliente_nome ?? "Cliente",
      candidatoNome: p.candidato_nome,
      vagaTitulo: p.vagas?.titulo ?? null,
      createdAt: p.created_at,
    })),
    temNovas: pendentes.some((p) => !idsVistos.has(p.id)),
  });
}
