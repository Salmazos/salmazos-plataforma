import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, propostaUpdateSchema } from "@/lib/schemas";
import { hojeSaoPaulo } from "@/lib/comercial";
import { exigirContextoPropostas } from "@/lib/propostasAcesso";
import { buscarOportunidadeAberta, carregarProposta, editarProposta, ehDonoDaProposta, planilhaMotDaProposta, planilhaTsDaProposta, podeVerProposta, varrerVencidas } from "@/lib/propostaServico";
import { modoEdicao, type SituacaoProposta } from "@/lib/propostas";
import { propostaTsParaPerfil } from "@/lib/propostaTs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
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

  // Só um booleano, só para quem tem Funil e é o dono: diz se recusar/aceitar mexe numa oportunidade DELE (a mesma regra do
  // efeitoAcompanhamento: aberta da empresa e do próprio vendedor), para a tela exigir o motivo que o "perdido" do Funil pede.
  // Nada da oportunidade (nem de outra pessoa) é devolvido.
  let oportunidadeAbertaPropria = false;
  if (ctx.temFunil && ehDonoDaProposta(ctx, proposta) && proposta.empresa_visitada_id && (proposta.situacao === "enviada" || proposta.situacao === "em_negociacao")) {
    const aberta = await buscarOportunidadeAberta(svc, proposta.empresa_visitada_id);
    oportunidadeAbertaPropria = !!aberta && aberta.vendedor_id === ctx.analistaId;
  }

  return NextResponse.json({
    data: {
      // TS: para quem não é gestor/diretoria o conteúdo sai sem o ISS por proposta, a cobertura dos postos e a justificativa da margem (filtrado aqui, no servidor).
      ...propostaTsParaPerfil(proposta, ctx.gestor),
      vendedor_nome: vendedor?.nome_completo ?? null,
      vendedor_telefone: vendedor?.telefone ?? null,
      revisoes: revisoes ?? [],
      historico: (historico ?? []).map((h) => ({ ...h, autor_nome: h.autor_id ? nomePorId.get(h.autor_id as string) ?? null : null })),
    },
    hoje,
    // Só no MOT: a planilha calculada (sem percentuais). No R&S a resposta é a de sempre, sem este campo.
    ...(proposta.modelo === "MOT" ? { planilhaMot: await planilhaMotDaProposta(svc, proposta) } : {}),
    // Só no TS: a planilha calculada pelo servidor (sem percentuais; a margem real só para o gestor). No R&S e no MOT a resposta é a de sempre.
    ...(proposta.modelo === "TS" ? { planilhaTs: await planilhaTsDaProposta(svc, ctx, proposta) } : {}),
    podeEditar: ehDonoDaProposta(ctx, proposta) && modoEdicao(proposta.situacao as SituacaoProposta) !== null,
    somenteLeitura: !ehDonoDaProposta(ctx, proposta),
    temFunil: ctx.temFunil,
    oportunidadeAbertaPropria,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoPropostas(user);
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
  return NextResponse.json({ data: propostaTsParaPerfil(r.data, ctx.gestor), ...(r.aviso ? { aviso: r.aviso } : {}) });
}
