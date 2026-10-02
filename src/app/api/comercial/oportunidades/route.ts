import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, oportunidadeCreateSchema } from "@/lib/schemas";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";

// Regra de acesso: as rotas usam service client (ignora RLS), então o filtro por vendedor/unidade
// precisa estar aqui, em toda query. Vendedor enxerga só o que é dele; gestor (diretoria/superuser)
// enxerga tudo, com filtro opcional — e só lê.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const sp = request.nextUrl.searchParams;
  let query = svc.from("oportunidades").select("*").order("proxima_acao_em", { ascending: true, nullsFirst: true });

  if (ctx.gestor) {
    const vendedor = sp.get("vendedor");
    const unidade = sp.get("unidade");
    if (vendedor) query = query.eq("vendedor_id", vendedor);
    if (!ctx.todasUnidades && ctx.unidadeId) query = query.eq("unidade_id", ctx.unidadeId);
    else if (unidade) query = query.eq("unidade_id", unidade);
  } else {
    query = query.eq("vendedor_id", ctx.analistaId);
  }
  const etapa = sp.get("etapa");
  if (etapa) query = query.eq("etapa", etapa);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = [...new Set((data ?? []).map((o) => o.vendedor_id as string))];
  const { data: vendedores } = ids.length
    ? await svc.from("analistas_perfil").select("id, nome_completo, unidade_id").in("id", ids)
    : { data: [] as { id: string; nome_completo: string; unidade_id: string | null }[] };
  const nomePorId = new Map((vendedores ?? []).map((v) => [v.id, v.nome_completo]));

  return NextResponse.json({
    data: (data ?? []).map((o) => ({ ...o, vendedor_nome: nomePorId.get(o.vendedor_id as string) ?? null })),
    hoje: hojeSaoPaulo(),
    somenteLeitura: !ctx.vendedor,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.vendedor) return NextResponse.json({ error: "Seu perfil só acompanha o funil, não cria oportunidades." }, { status: 403 });
  if (!ctx.unidadeId) return NextResponse.json({ error: "Seu perfil não tem unidade definida." }, { status: 400 });

  const parsed = parseBody(oportunidadeCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("oportunidades")
    .insert({
      unidade_id: ctx.unidadeId,
      vendedor_id: ctx.analistaId,
      empresa: d.empresa,
      contato_nome: d.contato_nome || null,
      contato_telefone: d.contato_telefone || null,
      contato_email: d.contato_email || null,
      origem: d.origem,
      servico_interesse: d.servico_interesse || null,
      valor_estimado: d.valor_estimado ?? null,
      etapa: d.etapa,
      proxima_acao: d.proxima_acao,
      proxima_acao_em: d.proxima_acao_em,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
