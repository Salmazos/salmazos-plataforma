import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";

export const dynamic = "force-dynamic";

interface SolicitacaoPendenteRow {
  id: string;
  cliente_nome: string;
  cargo: string;
  num_posicoes: number;
  created_at: string;
  confidencial: boolean;
}

// Quem vê o popup (Configurações > Avisos, evento solicitacao_vaga, canal popup):
//   - lista configurada  → só quem está na lista;
//   - canal desligado    → ninguém (desligado de propósito);
//   - sem configuração (ou falha ao ler) → critério ANTIGO: qualquer analista ativo (qualquer
//     nivel_acesso) da unidade, o mesmo público do e-mail via notifyAllAnalysts — diferente do sino
//     da própria solicitação, que só ia pra diretoria/superuser (ver POST
//     /api/portal/solicitar-vaga). Confirmado com o Olver, 23/09.
// O filtro de unidade abaixo é fixo e vale em qualquer um dos casos.
//
// Mesmo padrão estrutural de /api/cobrancas-rs/pendentes-popup: ESTADO PERSISTENTE (não
// evento-do-dia) — uma solicitação criada há dias e ainda pendente continua relevante
// hoje — e dedup por PENDÊNCIA INDIVIDUAL (solicitacao_vaga_popup_vistos), não "1x por
// dia": uma solicitação nova sempre reabre o popup, mesmo que outras já tenham sido
// vistas no mesmo dia.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const [lista, { data: perfil }] = await Promise.all([
    resolverDestinatarios("solicitacao_vaga", "popup", undefined, svc),
    svc
      .from("analistas_perfil")
      .select("id, unidade_id, acesso_todas_unidades")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .maybeSingle(),
  ]);
  if (!perfil) return NextResponse.json({ data: [], temNovas: false });
  if (lista.modo === "desligado") return NextResponse.json({ data: [], temNovas: false });
  if (lista.modo === "configurado" && !lista.userIds.includes(user.id)) {
    return NextResponse.json({ data: [], temNovas: false });
  }

  // Só as solicitações da unidade do analista (sócios com acesso a todas veem todas).
  let pendentesQuery = svc
    .from("solicitacoes_vagas")
    .select("id, cliente_nome, cargo, num_posicoes, created_at, confidencial")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });
  if (perfil.acesso_todas_unidades !== true) pendentesQuery = pendentesQuery.eq("unidade_id", perfil.unidade_id);
  const { data: pendentesRaw, error } = await pendentesQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pendentes = (pendentesRaw ?? []) as SolicitacaoPendenteRow[];
  if (pendentes.length === 0) return NextResponse.json({ data: [], temNovas: false });

  const { data: vistas } = await svc
    .from("solicitacao_vaga_popup_vistos")
    .select("solicitacao_vaga_id")
    .eq("usuario_id", user.id)
    .in("solicitacao_vaga_id", pendentes.map((p) => p.id));

  const idsVistos = new Set((vistas ?? []).map((v: { solicitacao_vaga_id: string }) => v.solicitacao_vaga_id));
  const temNovas = pendentes.some((p) => !idsVistos.has(p.id));

  const data = pendentes.map((p) => ({
    id: p.id,
    clienteNome: p.cliente_nome,
    cargo: p.cargo,
    numPosicoes: p.num_posicoes,
    createdAt: p.created_at,
    confidencial: p.confidencial,
  }));

  return NextResponse.json({ data, temNovas });
}
