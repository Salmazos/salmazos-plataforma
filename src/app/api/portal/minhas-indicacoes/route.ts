import { NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
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

  const { data: indicacoes, error } = await service
    .from("solicitacoes_indicacao_candidato")
    // motivo_recusa = "o que precisa ser corrigido" (correção solicitada pela equipe): o cliente DEVE ver.
    // O filtro por cliente E por usuário solicitante abaixo garante que só volta o que é dele.
    .select("id, candidato_nome, vaga_id, status, motivo_recusa, decidido_em, created_at")
    .eq("cliente_id", cu.cliente_id)
    .eq("solicitado_por_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[GET /api/portal/minhas-indicacoes]", error);
    return NextResponse.json({ error: "Erro ao carregar indicações." }, { status: 500 });
  }

  if (!indicacoes || indicacoes.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const vagaIds = indicacoes.map((i) => i.vaga_id).filter((id): id is string => !!id);
  const vagasMap: Record<string, { id: string; titulo: string }> = {};

  if (vagaIds.length > 0) {
    const { data: vagas, error: vagasErr } = await service
      .from("vagas")
      .select("id, titulo")
      .in("id", vagaIds)
      .eq("cliente_id", cu.cliente_id);

    if (vagasErr) {
      console.error("[GET /api/portal/minhas-indicacoes] Erro ao buscar vagas:", vagasErr);
      return NextResponse.json({ error: "Erro ao carregar vagas." }, { status: 500 });
    }

    if (vagas) {
      vagas.forEach((v) => {
        vagasMap[v.id] = v;
      });
    }
  }

  const resultado = indicacoes.map((ind) => ({
    ...ind,
    vaga_titulo: vagasMap[ind.vaga_id]?.titulo ?? null,
  }));

  return NextResponse.json({ data: resultado });
}
