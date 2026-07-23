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
  if (vagaIds.length > 0) {
    const { data: vagas } = await service
      .from("vagas")
      .select("id, slug")
      .in("id", vagaIds);
    slugMap = Object.fromEntries((vagas ?? []).filter((v) => v.slug).map((v) => [v.id, v.slug as string]));
  }

  const data = (solicitacoes ?? []).map((s) => ({
    ...s,
    vaga_slug: s.vaga_id ? slugMap[s.vaga_id] ?? null : null,
  }));

  return NextResponse.json({ data });
}
