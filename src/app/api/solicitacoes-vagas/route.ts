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

  let query = service
    .from("solicitacoes_vagas")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter !== "todos") {
    const idsComPedido = [...pedidoPorSolicitacao.keys()];
    query =
      statusFilter === "pendente" && idsComPedido.length > 0
        ? query.or(`status.eq.pendente,id.in.(${idsComPedido.join(",")})`)
        : query.eq("status", statusFilter);
  }
  if (!ctx.todasUnidades) {
    query = query.eq("unidade_id", ctx.unidadeId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comPedido = (data ?? []).map((s) => ({ ...s, alteracao_pendente: pedidoPorSolicitacao.get(s.id) ?? null }));
  return NextResponse.json({ data: comPedido, count: comPedido.length });
}
