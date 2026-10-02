import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, contatoEmpresaCreateSchema } from "@/lib/schemas";
import { exigirContextoComercial, type ContextoComercial } from "@/lib/comercial";

// Service client ignora RLS: a empresa só é acessível se for da unidade do usuário
// (gestor com acesso a todas as unidades também enxerga as demais, só para leitura).
async function carregarEmpresa(id: string, ctx: ContextoComercial, escrita: boolean) {
  const svc = createServiceClient();
  const { data: empresa } = await svc.from("empresas_visitadas").select("id, unidade_id").eq("id", id).maybeSingle();
  if (!empresa) return { svc, empresa: null };
  const mesmaUnidade = !!ctx.unidadeId && empresa.unidade_id === ctx.unidadeId;
  const alcance = escrita ? mesmaUnidade : mesmaUnidade || (ctx.gestor && ctx.todasUnidades);
  return { svc, empresa: alcance ? empresa : null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;

  const { svc, empresa } = await carregarEmpresa(id, ctx, false);
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const { data, error } = await svc
    .from("empresa_contatos")
    .select("id, nome, cargo, telefone, email, principal")
    .eq("empresa_visitada_id", id)
    .order("principal", { ascending: false })
    .order("nome", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  if (!ctx.vendedor) return NextResponse.json({ error: "Seu perfil só acompanha o funil, não cadastra contatos." }, { status: 403 });

  const { svc, empresa } = await carregarEmpresa(id, ctx, true);
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const parsed = parseBody(contatoEmpresaCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  // O primeiro contato da empresa vira o principal (há índice único parcial: um principal por empresa).
  const { count } = await svc.from("empresa_contatos").select("id", { count: "exact", head: true }).eq("empresa_visitada_id", id);

  const { data, error } = await svc
    .from("empresa_contatos")
    .insert({
      empresa_visitada_id: id,
      unidade_id: empresa.unidade_id,
      nome: d.nome,
      cargo: d.cargo || null,
      telefone: d.telefone || null,
      email: d.email || null,
      principal: (count ?? 0) === 0,
      criado_por: ctx.analistaId,
    })
    .select("id, nome, cargo, telefone, email, principal")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
