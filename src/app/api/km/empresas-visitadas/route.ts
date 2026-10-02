import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoCarteiraClientes } from "@/lib/comercialAuth";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { resolverContextoComercial, podeEscreverNaUnidade } from "@/lib/comercial";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Dia (AAAA-MM-DD) em Brasília de um instante ISO.
function diaSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// Oportunidade aberta (etapa fora de ganho/perdido) por empresa, com o nome do vendedor.
async function oportunidadesAbertas(svc: ServiceClient, empresaIds: string[]) {
  const porEmpresa = new Map<string, { id: string; vendedor_nome: string | null; etapa: string }>();
  if (empresaIds.length === 0) return porEmpresa;
  const { data: abertas } = await svc
    .from("oportunidades")
    .select("id, empresa_visitada_id, vendedor_id, etapa")
    .in("empresa_visitada_id", empresaIds)
    .not("etapa", "in", "(ganho,perdido)");
  const vendedorIds = [...new Set((abertas ?? []).map((o) => o.vendedor_id as string))];
  const { data: vendedores } = vendedorIds.length
    ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", vendedorIds)
    : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((vendedores ?? []).map((v) => [v.id, v.nome_completo]));
  for (const o of abertas ?? []) {
    porEmpresa.set(o.empresa_visitada_id as string, { id: o.id as string, vendedor_nome: nomePorId.get(o.vendedor_id as string) ?? null, etapa: o.etapa as string });
  }
  return porEmpresa;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoCarteiraClientes(user);
  if (acessoNegado) return acessoNegado;
  // Carteira separada por unidade (decisão do Olver, 24/09); sócios veem todas.
  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const params = request.nextUrl.searchParams;
  const q = params.get("q");
  const from = params.get("from");
  const to = params.get("to");
  const limit = Math.min(parseInt(params.get("limit") ?? "50"), 200);
  const empresaId = params.get("empresa_id");

  const svc = createServiceClient();

  // ── Histórico unificado de uma empresa ──
  if (empresaId) {
    const { data: empresa } = await svc
      .from("empresas_visitadas")
      .select("id, nome, unidade_id")
      .eq("id", empresaId)
      .single();

    if (!empresa || !podeVerUnidade(ctx, empresa.unidade_id)) {
      return NextResponse.json({ data: [], contatos: [], oportunidade_aberta: null, pode_escrever: false });
    }

    const ctxComercial = await resolverContextoComercial(user);
    const podeEscrever = !!ctxComercial && podeEscreverNaUnidade(ctxComercial, empresa.unidade_id);

    const { data: visitas, error } = await svc
      .from("km_visitas")
      .select("id, contato, motivo, resultado, resultado_comercial, tipo_visita, registro_id")
      .ilike("empresa", empresa.nome);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const registroIds = [...new Set((visitas ?? []).map((v) => v.registro_id as string))];
    const { data: registros } = registroIds.length
      ? await svc.from("km_registros").select("id, data, analista_id").in("id", registroIds)
      : { data: [] as { id: string; data: string; analista_id: string }[] };
    const registroMap = new Map((registros ?? []).map((r) => [r.id, r]));

    const { data: contatos } = await svc
      .from("empresa_contatos")
      .select("id, nome, cargo, telefone, email, principal")
      .eq("empresa_visitada_id", empresa.id)
      .eq("unidade_id", empresa.unidade_id)
      .order("principal", { ascending: false })
      .order("nome", { ascending: true });
    const nomeContato = new Map((contatos ?? []).map((c) => [c.id as string, c.nome as string]));

    // Funil: interações das oportunidades desta empresa (por id, na unidade da empresa).
    const { data: ops } = await svc.from("oportunidades").select("id").eq("empresa_visitada_id", empresa.id).eq("unidade_id", empresa.unidade_id);
    const opIds = (ops ?? []).map((o) => o.id as string);
    const { data: interacoes } = opIds.length
      ? await svc.from("oportunidade_interacoes").select("id, tipo, resultado, descricao, created_at, autor_id, contato_id").in("oportunidade_id", opIds)
      : { data: [] as { id: string; tipo: string; resultado: string | null; descricao: string | null; created_at: string; autor_id: string | null; contato_id: string | null }[] };

    const { data: avulsos } = await svc
      .from("contatos_registros")
      .select("id, tipo, resultado, descricao, ocorrido_em, created_at, autor_id, contato_id")
      .eq("empresa_visitada_id", empresa.id)
      .eq("unidade_id", empresa.unidade_id);

    const autorIds = [...new Set([
      ...(registros ?? []).map((r) => r.analista_id as string),
      ...(interacoes ?? []).map((i) => i.autor_id as string | null),
      ...(avulsos ?? []).map((a) => a.autor_id as string | null),
    ].filter((x): x is string => !!x))];
    const { data: perfis } = autorIds.length
      ? await svc.from("analistas_perfil").select("id, nome_completo, unidade_id").in("id", autorIds)
      : { data: [] as { id: string; nome_completo: string; unidade_id: string }[] };
    const nomeAutor = new Map((perfis ?? []).map((p) => [p.id, p.nome_completo]));
    // O histórico da KM casa as visitas pelo NOME da empresa — sem filtrar pela unidade do
    // analista, uma empresa homônima da outra unidade traria as visitas de lá junto.
    const unidadePorAnalista = new Map((perfis ?? []).map((p) => [p.id, p.unidade_id]));

    type Item = { id: string; origem: string; data: string | null; created_at: string | null; analista_nome: string | null; contato_nome: string | null; tipo: string | null; resultado: string | null; descricao: string | null };
    const itens: Item[] = [];

    for (const v of visitas ?? []) {
      const reg = registroMap.get(v.registro_id as string);
      if (!reg || unidadePorAnalista.get(reg.analista_id) !== empresa.unidade_id) continue;
      itens.push({
        id: `km-${v.id}`,
        origem: "visita_km",
        data: reg.data ?? null,
        created_at: null,
        analista_nome: nomeAutor.get(reg.analista_id) ?? null,
        contato_nome: (v.contato as string | null) ?? null,
        tipo: (v.tipo_visita as string | null) ?? "comercial",
        resultado: (v.resultado_comercial as string | null) ?? null,
        descricao: [v.motivo, v.resultado].filter((x) => x && String(x).trim()).join(" — ") || null,
      });
    }
    for (const i of interacoes ?? []) {
      const mudanca = i.tipo === "mudanca_etapa";
      itens.push({
        id: `op-${i.id}`,
        origem: mudanca ? "fase" : "funil",
        data: diaSaoPaulo(i.created_at),
        created_at: i.created_at,
        analista_nome: i.autor_id ? nomeAutor.get(i.autor_id) ?? null : null,
        contato_nome: i.contato_id ? nomeContato.get(i.contato_id) ?? null : null,
        tipo: mudanca ? null : i.tipo,
        resultado: i.resultado,
        descricao: mudanca && i.descricao ? `Oportunidade: ${i.descricao}` : i.descricao,
      });
    }
    for (const a of avulsos ?? []) {
      itens.push({
        id: `av-${a.id}`,
        origem: "avulso",
        data: String(a.ocorrido_em).slice(0, 10),
        created_at: a.created_at,
        analista_nome: a.autor_id ? nomeAutor.get(a.autor_id) ?? null : null,
        contato_nome: a.contato_id ? nomeContato.get(a.contato_id) ?? null : null,
        tipo: a.tipo,
        resultado: a.resultado,
        descricao: a.descricao,
      });
    }
    itens.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? ""));

    const abertas = await oportunidadesAbertas(svc, [empresa.id]);
    return NextResponse.json({
      data: itens.map(({ created_at: _c, ...resto }) => resto),
      contatos: contatos ?? [],
      oportunidade_aberta: abertas.get(empresa.id) ?? null,
      pode_escrever: podeEscrever,
    });
  }

  // ── Autocomplete / list ──
  let query = svc
    .from("empresas_visitadas")
    .select("id, nome, contato_nome, contato_telefone, contato_email, cidade, cliente_id, primeira_visita_em, ultima_visita_em, total_visitas, ultimo_visitante_nome")
    .order("ultima_visita_em", { ascending: false })
    .limit(limit);

  if (!ctx.todasUnidades) query = query.eq("unidade_id", ctx.unidadeId);
  if (q) query = query.ilike("nome", `%${q}%`);
  if (from) query = query.gte("ultima_visita_em", from);
  if (to) query = query.lte("ultima_visita_em", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lista = data ?? [];
  if (lista.length === 0) return NextResponse.json({ data: [] });

  // Em lote (sem N+1): contatos de todas as empresas listadas e oportunidades abertas delas.
  const ids = lista.map((e) => e.id as string);
  let qContatos = svc
    .from("empresa_contatos")
    .select("empresa_visitada_id, nome, telefone, email, principal, created_at")
    .in("empresa_visitada_id", ids)
    .order("created_at", { ascending: true });
  if (!ctx.todasUnidades) qContatos = qContatos.eq("unidade_id", ctx.unidadeId);
  const [{ data: contatos }, abertas] = await Promise.all([qContatos, oportunidadesAbertas(svc, ids)]);

  return NextResponse.json({
    data: lista.map((e) => {
      const deste = (contatos ?? []).filter((c) => c.empresa_visitada_id === e.id);
      const principal = deste.find((c) => c.principal) ?? null;
      return {
        ...e,
        // Sem contato cadastrado, mantém os campos legados da própria empresa.
        contato_nome: principal ? principal.nome : e.contato_nome,
        contato_telefone: principal ? principal.telefone : e.contato_telefone,
        contato_email: principal ? principal.email : e.contato_email,
        qtd_contatos: deste.length,
        oportunidade_aberta: abertas.get(e.id as string) ?? null,
      };
    }),
  });
}
