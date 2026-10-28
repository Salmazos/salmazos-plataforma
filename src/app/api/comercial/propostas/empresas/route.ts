import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas, MSG_SO_ACOMPANHA_PROPOSTAS } from "@/lib/propostasAcesso";
import { parseBody, empresaPropostaCreateSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Empresas da Carteira para escolher na proposta. Só id, nome e contatos: quem tem acesso a Propostas por liberação
// individual não passa pelas rotas do Funil, e a oportunidade aberta (vendedor e fase) só sai para quem tem Funil.
// O service client ignora RLS, então o filtro de unidade fica aqui: SEMPRE a unidade do usuário (mesma regra do
// criarRascunho, que só aceita empresa da própria unidade), mesmo para quem tem acesso a todas as unidades.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;
  if (!ctx.podeEscrever) return NextResponse.json({ error: MSG_SO_ACOMPANHA_PROPOSTAS }, { status: 403 });

  if (!ctx.unidadeId) return NextResponse.json({ data: [] });

  const svc = createServiceClient();
  let query = svc.from("empresas_visitadas").select("id, nome").eq("unidade_id", ctx.unidadeId).order("nome", { ascending: true }).limit(20);
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

// Cadastro rápido de quem ainda não é cliente, só para poder fazer a proposta. Fica na Carteira como prospect
// (sem cliente_id), sem oportunidade no Funil: por isso não exige perfil de vendedor, só poder escrever em Propostas.
// Quando fechar negócio, vira cliente pelo cadastro normal de clientes.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;
  if (!ctx.podeEscrever) return NextResponse.json({ error: MSG_SO_ACOMPANHA_PROPOSTAS }, { status: 403 });
  if (!ctx.unidadeId) return NextResponse.json({ error: "Seu perfil não tem unidade definida." }, { status: 400 });

  const parsed = parseBody(empresaPropostaCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;
  const nome = d.nome;

  const svc = createServiceClient();
  const { data: existente } = await svc
    .from("empresas_visitadas")
    .select("id, nome, cliente_id")
    .ilike("nome", escapeLike(nome))
    .eq("unidade_id", ctx.unidadeId)
    .limit(1)
    .maybeSingle();
  if (existente) {
    // Empresa já cadastrada: devolve com os contatos dela, sem duplicar nem gravar o contato digitado.
    const { data: contatosExistentes } = await svc
      .from("empresa_contatos")
      .select("id, nome, cargo, principal")
      .eq("empresa_visitada_id", existente.id)
      .order("principal", { ascending: false })
      .order("nome", { ascending: true });
    return NextResponse.json({ data: { ...existente, contatos: contatosExistentes ?? [], oportunidade_aberta: null } }, { status: 200 });
  }

  // Se já houver cliente com esse nome na unidade, a empresa nasce ligada a ele.
  const { data: cliente } = await svc
    .from("clientes")
    .select("id")
    .ilike("nome", escapeLike(nome))
    .eq("unidade_id", ctx.unidadeId)
    .limit(1)
    .maybeSingle();

  const agora = new Date().toISOString();
  const { data: empresa, error } = await svc
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
  if (error || !empresa) return NextResponse.json({ error: error?.message ?? "Não foi possível cadastrar a empresa." }, { status: 400 });

  let contatos: { id: string; nome: string; cargo: string | null; principal: boolean }[] = [];
  if (d.contato_nome) {
    const { data: contato, error: contatoErr } = await svc
      .from("empresa_contatos")
      .insert({
        empresa_visitada_id: empresa.id,
        unidade_id: ctx.unidadeId,
        nome: d.contato_nome,
        telefone: d.contato_telefone || null,
        email: d.contato_email || null,
        principal: true,
        criado_por: ctx.analistaId,
      })
      .select("id, nome, cargo, principal")
      .single();
    // A empresa já existe: falha só no contato não derruba o cadastro (o A/C ainda pode ser digitado na proposta).
    if (!contatoErr && contato) contatos = [contato];
  }

  registrarAuditoria({
    usuario_id: ctx.userId,
    acao: "empresa_criada_via_proposta",
    entidade: "empresas_visitadas",
    entidade_id: empresa.id,
    detalhes: { nome, cliente_id: empresa.cliente_id, com_contato: contatos.length > 0 },
  });

  return NextResponse.json({ data: { ...empresa, contatos, oportunidade_aberta: null } }, { status: 201 });
}
