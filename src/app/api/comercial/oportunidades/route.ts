import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, oportunidadeCreateSchema } from "@/lib/schemas";
import { exigirContextoComercial, hojeSaoPaulo, mensagemOportunidadeAberta } from "@/lib/comercial";

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

  // Criar já em "Proposta enviada" exige o mesmo que avançar até ela depois.
  if (d.etapa === "proposta_enviada") {
    if (d.valor_estimado == null || !(d.valor_estimado > 0)) {
      return NextResponse.json({ error: "Informe o valor estimado (maior que zero) para criar já em Proposta enviada." }, { status: 400 });
    }
    if (!d.servico_interesse?.trim()) {
      return NextResponse.json({ error: "Informe o serviço de interesse para criar já em Proposta enviada." }, { status: 400 });
    }
  }

  const svc = createServiceClient();

  // Service client ignora RLS: a empresa tem que ser da unidade do vendedor.
  const { data: empresa } = await svc
    .from("empresas_visitadas")
    .select("id, nome, cliente_id, unidade_id")
    .eq("id", d.empresa_visitada_id)
    .maybeSingle();
  if (!empresa || empresa.unidade_id !== ctx.unidadeId) {
    return NextResponse.json({ error: "Empresa não encontrada na Carteira da sua unidade." }, { status: 404 });
  }

  let contato: { id: string; nome: string; telefone: string | null; email: string | null } | null = null;
  if (d.contato_id) {
    const { data: c } = await svc
      .from("empresa_contatos")
      .select("id, nome, telefone, email, empresa_visitada_id")
      .eq("id", d.contato_id)
      .maybeSingle();
    if (!c || c.empresa_visitada_id !== empresa.id) {
      return NextResponse.json({ error: "Esse contato não pertence à empresa escolhida." }, { status: 400 });
    }
    contato = c;
  }

  const jaAberta = await mensagemOportunidadeAberta(svc, empresa.id);
  if (jaAberta) return NextResponse.json({ error: jaAberta }, { status: 409 });

  const { data, error } = await svc
    .from("oportunidades")
    .insert({
      unidade_id: ctx.unidadeId,
      vendedor_id: ctx.analistaId,
      empresa: empresa.nome,
      empresa_visitada_id: empresa.id,
      cliente_id: empresa.cliente_id ?? null,
      contato_id: contato?.id ?? null,
      // Snapshot do contato escolhido (a lista/cartões leem estes campos direto).
      contato_nome: contato?.nome ?? null,
      contato_telefone: contato?.telefone ?? null,
      contato_email: contato?.email ?? null,
      origem: d.origem,
      servico_interesse: d.servico_interesse || null,
      valor_estimado: d.valor_estimado ?? null,
      etapa: d.etapa,
      proxima_acao: d.proxima_acao,
      proxima_acao_em: d.proxima_acao_em,
    })
    .select()
    .single();
  if (error) {
    // Corrida entre duas criações: o índice único barra a segunda.
    if (error.code === "23505") {
      const msg = (await mensagemOportunidadeAberta(svc, empresa.id)) ?? "Já existe uma oportunidade aberta para esta empresa.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
