import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, propostaCreateSchema } from "@/lib/schemas";
import { hojeSaoPaulo } from "@/lib/comercial";
import { exigirContextoPropostas, MSG_SO_ACOMPANHA_PROPOSTAS } from "@/lib/propostasAcesso";
import { criarRascunho, varrerVencidas } from "@/lib/propostaServico";

const COLUNAS_LISTA = "id, numero, modelo, revisao_atual, situacao, cliente_nome, aos_cuidados, vendedor_id, unidade_id, validade_ate, valor_estimado, enviada_em, created_at, updated_at";

// Mesma regra das oportunidades: o service client ignora RLS, então o filtro por vendedor/unidade vive aqui.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();
  await varrerVencidas(svc, hoje);

  const sp = request.nextUrl.searchParams;
  let query = svc.from("propostas").select(COLUNAS_LISTA).order("created_at", { ascending: false });
  if (ctx.gestor) {
    const vendedor = sp.get("vendedor");
    if (vendedor) query = query.eq("vendedor_id", vendedor);
    if (!ctx.todasUnidades && ctx.unidadeId) query = query.eq("unidade_id", ctx.unidadeId);
  } else {
    query = query.eq("vendedor_id", ctx.analistaId);
  }
  const situacao = sp.get("situacao");
  if (situacao) query = query.eq("situacao", situacao);
  const modelo = sp.get("modelo");
  if (modelo) query = query.eq("modelo", modelo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = [...new Set((data ?? []).map((p) => p.vendedor_id as string))];
  const { data: vendedores } = ids.length
    ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", ids)
    : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((vendedores ?? []).map((v) => [v.id, v.nome_completo]));

  return NextResponse.json({
    data: (data ?? []).map((p) => ({ ...p, vendedor_nome: nomePorId.get(p.vendedor_id as string) ?? null })),
    hoje,
    somenteLeitura: !ctx.podeEscrever,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
  if (erro) return erro;
  if (!ctx.podeEscrever) return NextResponse.json({ error: MSG_SO_ACOMPANHA_PROPOSTAS }, { status: 403 });

  const parsed = parseBody(propostaCreateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const r = await criarRascunho(createServiceClient(), ctx, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data, aviso: r.aviso ?? null }, { status: 201 });
}
