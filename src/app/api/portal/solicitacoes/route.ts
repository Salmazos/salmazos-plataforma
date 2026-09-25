import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { clientePodePedirAlteracao } from "@/lib/solicitacaoAlteracao";

export async function GET(request: NextRequest) {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();

  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const apenasMinhas = request.nextUrl.searchParams.get("filtro") === "minhas";

  // Campos editáveis vêm junto pro formulário de pedido de alteração (ver
  // /api/portal/solicitacoes/[id]/alteracao).
  let query = service
    .from("solicitacoes_vagas")
    .select("id, cargo, tipo_servico, num_posicoes, cidade, estado, status, motivo_recusa, vaga_id, solicitado_por_user_id, created_at, salario, adicionais_salariais, previsao_inicio, horario_texto, requisitos, beneficios, observacoes, confidencial")
    .eq("cliente_id", cu.cliente_id);

  if (apenasMinhas) query = query.eq("solicitado_por_user_id", user.id);

  const { data: solicitacoes, error } = await query.order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vagaIds = (solicitacoes ?? []).map((s) => s.vaga_id).filter((id): id is string => !!id);
  const solicitacaoIds = (solicitacoes ?? []).map((s) => s.id);

  // Último pedido de alteração decidido/pendente de cada solicitação (pendente tem prioridade,
  // senão o mais recente aprovado/recusado — pra mostrar o motivo de uma recusa).
  // alteracoes vai junto pra o formulário do cliente abrir já com o que ele pediu (senão
  // "editar novamente" partiria dos valores atuais e perderia o pedido pendente).
  const alteracaoPorSolicitacao: Record<
    string,
    { status: string; motivo_recusa: string | null; criado_em: string; alteracoes: Record<string, { antes: unknown; depois: unknown }> }
  > = {};
  if (solicitacaoIds.length > 0) {
    const { data: pedidos } = await service
      .from("solicitacao_vaga_alteracoes")
      .select("solicitacao_vaga_id, status, motivo_recusa, criado_em, alteracoes")
      .in("solicitacao_vaga_id", solicitacaoIds)
      .neq("status", "substituida")
      .order("criado_em", { ascending: false });
    for (const p of pedidos ?? []) {
      const atual = alteracaoPorSolicitacao[p.solicitacao_vaga_id];
      if (!atual || (p.status === "pendente" && atual.status !== "pendente")) {
        alteracaoPorSolicitacao[p.solicitacao_vaga_id] = {
          status: p.status,
          motivo_recusa: p.motivo_recusa,
          criado_em: p.criado_em,
          alteracoes: p.alteracoes,
        };
      }
    }
  }

  const vagaStatusMap: Record<string, string> = {};
  let slugMap: Record<string, string> = {};
  // candidatosAprovados/Reprovados são exibidos no card de "Minhas Solicitações" só
  // pra vagas já aprovadas (que viraram vaga de verdade) — busca por vaga_id, não por
  // solicitacao_vaga_id, já que encaminhamentos não referencia solicitacoes_vagas.
  const aprovadosPorVaga: Record<string, string[]> = {};
  const reprovadosPorVaga: Record<string, string[]> = {};
  if (vagaIds.length > 0) {
    const [{ data: vagas }, { data: encaminhamentos }] = await Promise.all([
      service.from("vagas").select("id, slug, status").in("id", vagaIds),
      service
        .from("encaminhamentos")
        .select("vaga_id, status, candidatos(nome_completo)")
        .in("vaga_id", vagaIds)
        .in("status", ["aprovado", "reprovado"]),
    ]);
    slugMap = Object.fromEntries((vagas ?? []).filter((v) => v.slug).map((v) => [v.id, v.slug as string]));
    for (const v of vagas ?? []) vagaStatusMap[v.id] = v.status;

    for (const enc of encaminhamentos ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nome = (enc.candidatos as any)?.nome_completo as string | undefined;
      if (!enc.vaga_id || !nome) continue;
      const alvo = enc.status === "aprovado" ? aprovadosPorVaga : reprovadosPorVaga;
      (alvo[enc.vaga_id] ??= []).push(nome);
    }
  }

  const data = (solicitacoes ?? []).map((s) => ({
    ...s,
    vaga_slug: s.vaga_id ? slugMap[s.vaga_id] ?? null : null,
    candidatos_aprovados: s.vaga_id ? aprovadosPorVaga[s.vaga_id] ?? [] : [],
    candidatos_reprovados: s.vaga_id ? reprovadosPorVaga[s.vaga_id] ?? [] : [],
    pode_editar: clientePodePedirAlteracao(s.status, s.vaga_id ? vagaStatusMap[s.vaga_id] ?? null : null),
    alteracao: alteracaoPorSolicitacao[s.id] ?? null,
  }));

  return NextResponse.json({ data });
}
