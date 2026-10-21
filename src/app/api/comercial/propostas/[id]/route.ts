import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, propostaUpdateSchema } from "@/lib/schemas";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";
import { carregarProposta, editarProposta, ehDonoDaProposta, podeVerProposta, varrerVencidas } from "@/lib/propostaServico";
import { modoEdicao, type SituacaoProposta } from "@/lib/propostas";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();
  await varrerVencidas(svc, hoje, id);

  const proposta = await carregarProposta(svc, id);
  // Proposta de outro vendedor aparece como inexistente (não revela que existe).
  if (!proposta || !podeVerProposta(ctx, proposta)) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  const [{ data: revisoes }, { data: historico }, { data: vendedor }] = await Promise.all([
    svc.from("proposta_revisoes").select("id, revisao, template_versao, vendedor_nome, vendedor_telefone, created_at").eq("proposta_id", id).order("revisao", { ascending: false }),
    svc.from("proposta_historico").select("id, de, para, autor_id, observacao, created_at").eq("proposta_id", id).order("created_at", { ascending: true }),
    svc.from("analistas_perfil").select("id, nome_completo, telefone").eq("id", proposta.vendedor_id).maybeSingle(),
  ]);
  const autores = [...new Set((historico ?? []).map((h) => h.autor_id as string | null).filter((a): a is string => !!a))];
  const { data: nomes } = autores.length ? await svc.from("analistas_perfil").select("id, nome_completo").in("id", autores) : { data: [] as { id: string; nome_completo: string }[] };
  const nomePorId = new Map((nomes ?? []).map((n) => [n.id, n.nome_completo]));

  return NextResponse.json({
    data: {
      ...proposta,
      vendedor_nome: vendedor?.nome_completo ?? null,
      vendedor_telefone: vendedor?.telefone ?? null,
      revisoes: revisoes ?? [],
      historico: (historico ?? []).map((h) => ({ ...h, autor_nome: h.autor_id ? nomePorId.get(h.autor_id as string) ?? null : null })),
    },
    hoje,
    podeEditar: ehDonoDaProposta(ctx, proposta) && modoEdicao(proposta.situacao as SituacaoProposta) !== null,
    somenteLeitura: !ehDonoDaProposta(ctx, proposta),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;

  const svc = createServiceClient();
  const proposta = await carregarProposta(svc, id);
  if (!proposta || !podeVerProposta(ctx, proposta)) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  // Gestor só lê; quem vê mas não é o dono (gestor) não escreve.
  if (!ehDonoDaProposta(ctx, proposta)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

  const parsed = parseBody(propostaUpdateSchema, await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const r = await editarProposta(svc, ctx, proposta, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ data: r.data });
}
