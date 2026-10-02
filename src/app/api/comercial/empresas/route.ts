import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, empresaComercialCreateSchema } from "@/lib/schemas";
import { exigirContextoComercial } from "@/lib/comercial";

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// A Carteira é separada por unidade e o service client ignora RLS: o filtro de unidade fica aqui.
// Vendedor enxerga só a própria unidade; gestor com acesso a todas as unidades enxerga tudo.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  let query = svc
    .from("empresas_visitadas")
    .select("id, nome, cliente_id, unidade_id")
    .order("nome", { ascending: true })
    .limit(20);

  if (ctx.gestor && ctx.todasUnidades) {
    // sem filtro de unidade
  } else if (ctx.unidadeId) {
    query = query.eq("unidade_id", ctx.unidadeId);
  } else {
    return NextResponse.json({ data: [] });
  }
  // ?id= busca uma empresa específica (usado ao abrir a oportunidade vinda da Carteira); o filtro de
  // unidade acima continua valendo.
  const idFiltro = request.nextUrl.searchParams.get("id");
  if (idFiltro) query = query.eq("id", idFiltro);
  if (q) query = query.ilike("nome", `%${escapeLike(q)}%`);

  const { data: empresas, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lista = empresas ?? [];
  const ids = lista.map((e) => e.id as string);
  if (ids.length === 0) return NextResponse.json({ data: [] });

  const [{ data: contatos }, { data: abertas }] = await Promise.all([
    svc.from("empresa_contatos").select("id, empresa_visitada_id, nome, cargo, telefone, email, principal").in("empresa_visitada_id", ids).order("principal", { ascending: false }).order("nome", { ascending: true }),
    svc.from("oportunidades").select("id, empresa_visitada_id, vendedor_id, etapa").in("empresa_visitada_id", ids).not("etapa", "in", "(ganho,perdido)"),
  ]);

  const vendedorIds = [...new Set((abertas ?? []).map((o) => o.vendedor_id as string))];
  const { data: vendedores } = vendedorIds.length
    ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", vendedorIds)
    : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((vendedores ?? []).map((v) => [v.id, v.nome_completo]));

  return NextResponse.json({
    data: lista.map((e) => {
      const aberta = (abertas ?? []).find((o) => o.empresa_visitada_id === e.id);
      return {
        id: e.id,
        nome: e.nome,
        cliente_id: e.cliente_id,
        contatos: (contatos ?? []).filter((c) => c.empresa_visitada_id === e.id).map((c) => ({
          id: c.id, nome: c.nome, cargo: c.cargo, telefone: c.telefone, email: c.email, principal: c.principal,
        })),
        oportunidade_aberta: aberta
          ? { id: aberta.id, vendedor_nome: nomePorId.get(aberta.vendedor_id as string) ?? null, etapa: aberta.etapa }
          : null,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.vendedor) return NextResponse.json({ error: "Seu perfil só acompanha o funil, não cadastra empresas." }, { status: 403 });
  if (!ctx.unidadeId) return NextResponse.json({ error: "Seu perfil não tem unidade definida." }, { status: 400 });

  const parsed = parseBody(empresaComercialCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const nome = parsed.data.nome;

  const svc = createServiceClient();
  const { data: existente } = await svc
    .from("empresas_visitadas")
    .select("id, nome, cliente_id")
    .ilike("nome", escapeLike(nome))
    .eq("unidade_id", ctx.unidadeId)
    .limit(1)
    .maybeSingle();
  if (existente) return NextResponse.json({ data: { ...existente, contatos: [], oportunidade_aberta: null } }, { status: 200 });

  // Tenta casar com um cliente da mesma unidade, como a KM fazia, para já nascer ligada.
  const { data: cliente } = await svc
    .from("clientes")
    .select("id")
    .ilike("nome", escapeLike(nome))
    .eq("unidade_id", ctx.unidadeId)
    .limit(1)
    .maybeSingle();

  const agora = new Date().toISOString();
  const { data, error } = await svc
    .from("empresas_visitadas")
    .insert({
      nome,
      unidade_id: ctx.unidadeId,
      created_by: ctx.userId,
      cliente_id: cliente?.id ?? null,
      primeira_visita_em: agora,
      ultima_visita_em: agora,
      total_visitas: 0,
      ultimo_visitante_id: null,
    })
    .select("id, nome, cliente_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: { ...data, contatos: [], oportunidade_aberta: null } }, { status: 201 });
}
