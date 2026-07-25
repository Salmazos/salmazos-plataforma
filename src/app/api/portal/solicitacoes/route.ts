import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

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

  let query = service
    .from("solicitacoes_vagas")
    .select("id, cargo, tipo_servico, num_posicoes, cidade, estado, status, motivo_recusa, vaga_id, solicitado_por_user_id, created_at")
    .eq("cliente_id", cu.cliente_id);

  if (apenasMinhas) query = query.eq("solicitado_por_user_id", user.id);

  const { data: solicitacoes, error } = await query.order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vagaIds = (solicitacoes ?? []).map((s) => s.vaga_id).filter((id): id is string => !!id);
  let slugMap: Record<string, string> = {};
  // candidatosAprovados/Reprovados são exibidos no card de "Minhas Solicitações" só
  // pra vagas já aprovadas (que viraram vaga de verdade) — busca por vaga_id, não por
  // solicitacao_vaga_id, já que encaminhamentos não referencia solicitacoes_vagas.
  const aprovadosPorVaga: Record<string, string[]> = {};
  const reprovadosPorVaga: Record<string, string[]> = {};
  if (vagaIds.length > 0) {
    const [{ data: vagas }, { data: encaminhamentos }] = await Promise.all([
      service.from("vagas").select("id, slug").in("id", vagaIds),
      service
        .from("encaminhamentos")
        .select("vaga_id, status, candidatos(nome_completo)")
        .in("vaga_id", vagaIds)
        .in("status", ["aprovado", "reprovado"]),
    ]);
    slugMap = Object.fromEntries((vagas ?? []).filter((v) => v.slug).map((v) => [v.id, v.slug as string]));

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
  }));

  return NextResponse.json({ data });
}
