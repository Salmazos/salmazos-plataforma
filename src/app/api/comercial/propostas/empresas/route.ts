import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas, MSG_SO_ACOMPANHA_PROPOSTAS } from "@/lib/propostasAcesso";

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Empresas da Carteira para escolher na proposta. Só id, nome e contatos: quem tem acesso a Propostas por liberação
// individual não passa pelas rotas do Funil, e a oportunidade aberta (vendedor e fase) só sai para quem tem Funil.
// O service client ignora RLS, então o filtro de unidade fica aqui.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;
  if (!ctx.podeEscrever) return NextResponse.json({ error: MSG_SO_ACOMPANHA_PROPOSTAS }, { status: 403 });

  const svc = createServiceClient();
  let query = svc.from("empresas_visitadas").select("id, nome").order("nome", { ascending: true }).limit(20);
  if (ctx.todasUnidades) {
    // sem filtro de unidade
  } else if (ctx.unidadeId) {
    query = query.eq("unidade_id", ctx.unidadeId);
  } else {
    return NextResponse.json({ data: [] });
  }
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q) query = query.ilike("nome", `%${escapeLike(q)}%`);

  const { data: empresas, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lista = empresas ?? [];
  const ids = lista.map((e) => e.id as string);
  if (ids.length === 0) return NextResponse.json({ data: [] });

  const { data: contatos } = await svc
    .from("empresa_contatos")
    .select("id, empresa_visitada_id, nome, cargo, principal")
    .in("empresa_visitada_id", ids)
    .order("principal", { ascending: false })
    .order("nome", { ascending: true });

  let abertaPorEmpresa = new Map<string, { id: string; vendedor_nome: string | null; etapa: string }>();
  if (ctx.temFunil) {
    const { data: abertas } = await svc
      .from("oportunidades")
      .select("id, empresa_visitada_id, vendedor_id, etapa")
      .in("empresa_visitada_id", ids)
      .not("etapa", "in", "(ganho,perdido)");
    const vendedorIds = [...new Set((abertas ?? []).map((o) => o.vendedor_id as string))];
    const { data: vendedores } = vendedorIds.length
      ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", vendedorIds)
      : { data: [] as { id: string; nome_completo: string }[] };
    const nomePorId = new Map((vendedores ?? []).map((v) => [v.id, v.nome_completo]));
    abertaPorEmpresa = new Map(
      (abertas ?? []).map((o) => [o.empresa_visitada_id as string, { id: o.id as string, vendedor_nome: nomePorId.get(o.vendedor_id as string) ?? null, etapa: o.etapa as string }])
    );
  }

  return NextResponse.json({
    data: lista.map((e) => ({
      id: e.id,
      nome: e.nome,
      contatos: (contatos ?? []).filter((c) => c.empresa_visitada_id === e.id).map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo, principal: c.principal })),
      ...(ctx.temFunil ? { oportunidade_aberta: abertaPorEmpresa.get(e.id as string) ?? null } : {}),
    })),
  });
}
