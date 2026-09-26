import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade } from "@/lib/unidadeAuth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const statusFilter = request.nextUrl.searchParams.get("status") ?? "pendente";

  const service = createServiceClient();

  // Pedidos de alteração do cliente aguardando aprovação (ver
  // /api/portal/solicitacoes/[id]/alteracao) — a solicitação deles aparece na lista mesmo que
  // já esteja aprovada, pra equipe decidir no mesmo lugar.
  let pedidosQuery = service
    .from("solicitacao_vaga_alteracoes")
    .select("id, solicitacao_vaga_id, alteracoes, criado_em")
    .eq("status", "pendente");
  if (!ctx.todasUnidades) pedidosQuery = pedidosQuery.eq("unidade_id", ctx.unidadeId);
  const { data: pedidos } = await pedidosQuery;
  const pedidoPorSolicitacao = new Map((pedidos ?? []).map((p) => [p.solicitacao_vaga_id, p]));

  // Mesmo padrão pros pedidos de pausa/reabertura de vaga (ver vagaPausaReativacao.ts) —
  // esses ficam na tabela vaga_solicitacoes_status, chaveados por vaga_id, não
  // solicitacao_vaga_id, então o mapa e o "aparece mesmo aprovada" usam vaga_id.
  let pedidosStatusQuery = service
    .from("vaga_solicitacoes_status")
    .select("id, vaga_id, acao, motivo_tipo, motivo_texto, criado_em")
    .eq("status", "pendente");
  if (!ctx.todasUnidades) pedidosStatusQuery = pedidosStatusQuery.eq("unidade_id", ctx.unidadeId);
  const { data: pedidosStatus } = await pedidosStatusQuery;
  const pedidoStatusPorVaga = new Map((pedidosStatus ?? []).map((p) => [p.vaga_id, p]));

  let query = service
    .from("solicitacoes_vagas")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter !== "todos") {
    const idsComPedido = [...pedidoPorSolicitacao.keys()];
    // status_pendente é indexado por vaga_id (não solicitacao_vaga_id) — solicitacoes_vagas
    // também tem a coluna vaga_id, então filtra direto por ela em vez de resolver o id da
    // solicitação primeiro.
    const vagaIdsComPedidoStatus = [...pedidoStatusPorVaga.keys()];
    const filtrosOr = [
      "status.eq.pendente",
      idsComPedido.length > 0 ? `id.in.(${idsComPedido.join(",")})` : null,
      vagaIdsComPedidoStatus.length > 0 ? `vaga_id.in.(${vagaIdsComPedidoStatus.join(",")})` : null,
    ].filter(Boolean);
    query =
      statusFilter === "pendente" && filtrosOr.length > 1
        ? query.or(filtrosOr.join(","))
        : query.eq("status", statusFilter);
  }
  if (!ctx.todasUnidades) {
    query = query.eq("unidade_id", ctx.unidadeId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comPedido = (data ?? []).map((s) => ({
    ...s,
    alteracao_pendente: pedidoPorSolicitacao.get(s.id) ?? null,
    status_pendente: s.vaga_id ? pedidoStatusPorVaga.get(s.vaga_id) ?? null : null,
  }));
  return NextResponse.json({ data: comPedido, count: comPedido.length });
}
