import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolverDestinatarios } from "@/lib/avisos";
import {
  EVENTO_POR_TIPO_PEDIDO,
  TIPOS_PEDIDO_CLIENTE,
  chaveVisto,
  tiposVisiveis,
  type TipoPedidoCliente,
} from "@/lib/pedidosClientePopup";

export const dynamic = "force-dynamic";

interface ItemPedido {
  tipo: TipoPedidoCliente;
  id: string;
  clienteNome: string;
  cargo: string;
  solicitacaoId: string | null;
  vagaId: string | null;
  createdAt: string;
}

// Popup "Pedidos do cliente", lido UMA vez ao entrar no painel (sem polling). Junta os pedidos
// PENDENTES de alteração de solicitação, reativação e pausa/encerramento de vaga. Cada tipo só entra
// para quem está na lista do canal popup do respectivo evento (Configurações > Avisos); sem
// configuração, falha de leitura ou canal desligado, o tipo não aparece — o popup só existe quando a
// configuração existe. O filtro de unidade é fixo (pedidos da unidade do usuário; sócios com acesso a
// todas veem todos).
//
// REGRA DA LISTA (mesma do popup de indicações): `data` traz TODOS os pedidos pendentes dos tipos
// visíveis, INCLUSIVE os já vistos; o registro de "visto" (pedido_cliente_popup_vistos, por usuário,
// tipo e pedido) só decide SE o popup abre: `temNovas` é true quando existe ao menos um pendente ainda
// não visto.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const vazio = () => NextResponse.json({ data: [], temNovas: false });

  const [alteracao, reativacao, pausa, { data: perfil }] = await Promise.all([
    resolverDestinatarios(EVENTO_POR_TIPO_PEDIDO.alteracao, "popup", undefined, svc),
    resolverDestinatarios(EVENTO_POR_TIPO_PEDIDO.reativacao, "popup", undefined, svc),
    resolverDestinatarios(EVENTO_POR_TIPO_PEDIDO.pausa, "popup", undefined, svc),
    svc.from("analistas_perfil").select("unidade_id, acesso_todas_unidades").eq("user_id", user.id).eq("ativo", true).maybeSingle(),
  ]);
  if (!perfil) return vazio();

  const tipos = tiposVisiveis({ alteracao, reativacao, pausa }, user.id);
  if (tipos.length === 0) return vazio();
  const filtrarUnidade = perfil.acesso_todas_unidades !== true;

  const itens: ItemPedido[] = [];

  if (tipos.includes("alteracao")) {
    let q = svc.from("solicitacao_vaga_alteracoes").select("id, solicitacao_vaga_id, criado_em").eq("status", "pendente");
    if (filtrarUnidade) q = q.eq("unidade_id", perfil.unidade_id);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const pedidos = data ?? [];
    const ids = pedidos.map((p) => p.solicitacao_vaga_id);
    const { data: sols } = ids.length
      ? await svc.from("solicitacoes_vagas").select("id, cliente_nome, cargo").in("id", ids)
      : { data: [] as { id: string; cliente_nome: string | null; cargo: string }[] };
    const porId = new Map((sols ?? []).map((s) => [s.id, s]));
    for (const p of pedidos) {
      const s = porId.get(p.solicitacao_vaga_id);
      itens.push({
        tipo: "alteracao",
        id: p.id,
        clienteNome: s?.cliente_nome ?? "Cliente",
        cargo: s?.cargo ?? "",
        solicitacaoId: p.solicitacao_vaga_id,
        vagaId: null,
        createdAt: p.criado_em,
      });
    }
  }

  // Reativação e pausa moram na mesma tabela (vaga_solicitacoes_status), separadas por `acao`.
  const acoes: { tipo: TipoPedidoCliente; acao: string }[] = [
    { tipo: "reativacao" as const, acao: "reabrir" },
    { tipo: "pausa" as const, acao: "pausar" },
  ].filter((a) => tipos.includes(a.tipo));
  if (acoes.length > 0) {
    let q = svc
      .from("vaga_solicitacoes_status")
      .select("id, vaga_id, acao, criado_em")
      .eq("status", "pendente")
      .in("acao", acoes.map((a) => a.acao));
    if (filtrarUnidade) q = q.eq("unidade_id", perfil.unidade_id);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const pedidos = data ?? [];
    const vagaIds = [...new Set(pedidos.map((p) => p.vaga_id))];
    // O pedido é chaveado por vaga; o destino do clique (igual ao do sino) é a solicitação da vaga.
    const { data: sols } = vagaIds.length
      ? await svc.from("solicitacoes_vagas").select("id, vaga_id, cliente_nome, cargo").in("vaga_id", vagaIds)
      : { data: [] as { id: string; vaga_id: string; cliente_nome: string | null; cargo: string }[] };
    const porVaga = new Map((sols ?? []).map((s) => [s.vaga_id, s]));
    for (const p of pedidos) {
      const s = porVaga.get(p.vaga_id);
      itens.push({
        tipo: p.acao === "reabrir" ? "reativacao" : "pausa",
        id: p.id,
        clienteNome: s?.cliente_nome ?? "Cliente",
        cargo: s?.cargo ?? "",
        solicitacaoId: s?.id ?? null,
        vagaId: p.vaga_id,
        createdAt: p.criado_em,
      });
    }
  }

  if (itens.length === 0) return vazio();
  itens.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const { data: vistos } = await svc
    .from("pedido_cliente_popup_vistos")
    .select("tipo_pedido, pedido_id")
    .eq("usuario_id", user.id)
    .in("tipo_pedido", [...TIPOS_PEDIDO_CLIENTE])
    .in("pedido_id", itens.map((i) => i.id));
  const jaVistos = new Set((vistos ?? []).map((v: { tipo_pedido: string; pedido_id: string }) => chaveVisto(v.tipo_pedido, v.pedido_id)));

  return NextResponse.json({
    data: itens,
    temNovas: itens.some((i) => !jaVistos.has(chaveVisto(i.tipo, i.id))),
  });
}
