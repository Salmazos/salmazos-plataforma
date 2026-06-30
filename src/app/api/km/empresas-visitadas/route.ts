import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const q = params.get("q");
  const from = params.get("from");
  const to = params.get("to");
  const limit = Math.min(parseInt(params.get("limit") ?? "50"), 200);
  const empresaId = params.get("empresa_id");

  const svc = createServiceClient();

  // ── Full visit history for one company ──
  if (empresaId) {
    const { data: empresa } = await svc
      .from("empresas_visitadas")
      .select("nome")
      .eq("id", empresaId)
      .single();

    if (!empresa) return NextResponse.json({ data: [] });

    const { data: visitas, error } = await svc
      .from("km_visitas")
      .select("id, empresa, contato, contato_telefone, contato_email, motivo, resultado, registro_id")
      .ilike("empresa", empresa.nome)
      .order("id", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!visitas || visitas.length === 0) return NextResponse.json({ data: [] });

    // Enrich with registro date + analista name
    const registroIds = [...new Set(visitas.map((v) => v.registro_id))];
    const { data: registros } = await svc
      .from("km_registros")
      .select("id, data, analista_id")
      .in("id", registroIds);

    const analistaIds = [...new Set((registros ?? []).map((r) => r.analista_id).filter(Boolean))];
    const { data: perfis } = await svc
      .from("analistas_perfil")
      .select("id, nome_completo")
      .in("id", analistaIds);

    const registroMap = new Map((registros ?? []).map((r) => [r.id, r]));
    const perfilMap = new Map((perfis ?? []).map((p) => [p.id, p.nome_completo]));

    const enriched = visitas.map((v) => {
      const reg = registroMap.get(v.registro_id);
      return {
        ...v,
        data: reg?.data ?? null,
        analista_nome: reg ? (perfilMap.get(reg.analista_id) ?? null) : null,
      };
    }).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));

    return NextResponse.json({ data: enriched });
  }

  // ── Autocomplete / list ──
  let query = svc
    .from("empresas_visitadas")
    .select("id, nome, contato_nome, contato_telefone, contato_email, cidade, cliente_id, primeira_visita_em, ultima_visita_em, total_visitas, ultimo_visitante_nome")
    .order("ultima_visita_em", { ascending: false })
    .limit(limit);

  if (q) query = query.ilike("nome", `%${q}%`);
  if (from) query = query.gte("ultima_visita_em", from);
  if (to) query = query.lte("ultima_visita_em", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
