import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, oportunidadeInteracaoCreateSchema } from "@/lib/schemas";
import { exigirContextoComercial } from "@/lib/comercial";
import { ehAberta } from "@/lib/comercialRotulos";

async function carregarOportunidade(id: string, ctx: { gestor: boolean; todasUnidades: boolean; unidadeId: string | null; analistaId: string; vendedor: boolean }) {
  const svc = createServiceClient();
  const { data: opp } = await svc.from("oportunidades").select("*").eq("id", id).maybeSingle();
  if (!opp) return { opp: null, svc };
  const proprio = opp.vendedor_id === ctx.analistaId;
  const gestorAlcanca = ctx.gestor && (ctx.todasUnidades || !ctx.unidadeId || opp.unidade_id === ctx.unidadeId);
  return { opp: proprio || gestorAlcanca ? opp : null, svc };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  const { opp, svc } = await carregarOportunidade(id, ctx);
  if (!opp) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });

  const { data, error } = await svc
    .from("oportunidade_interacoes")
    .select("id, tipo, resultado, descricao, created_at, autor_id")
    .eq("oportunidade_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  const { opp, svc } = await carregarOportunidade(id, ctx);
  if (!opp) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  if (!ctx.vendedor || opp.vendedor_id !== ctx.analistaId) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const parsed = parseBody(oportunidadeInteracaoCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  const aberta = ehAberta(opp.etapa);
  if (aberta && (!d.proxima_acao || !d.proxima_acao_em)) {
    return NextResponse.json({ error: "Informe a próxima ação e a data." }, { status: 400 });
  }

  const { data, error } = await svc
    .from("oportunidade_interacoes")
    .insert({
      oportunidade_id: id,
      autor_id: ctx.analistaId,
      tipo: d.tipo,
      resultado: d.resultado ?? null,
      descricao: d.descricao || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (aberta && d.proxima_acao && d.proxima_acao_em) {
    await svc
      .from("oportunidades")
      .update({ proxima_acao: d.proxima_acao, proxima_acao_em: d.proxima_acao_em, updated_at: new Date().toISOString() })
      .eq("id", id);
  }
  return NextResponse.json({ data }, { status: 201 });
}
