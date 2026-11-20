import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoPropostas, type ContextoPropostas } from "@/lib/propostasAcesso";
import { registrarAuditoria } from "@/lib/audit";

// Marcar / desmarcar uma empresa da Carteira como "de teste" (propostas dela saem com número TESTE-..., escondidas das listas e sem efeito no Funil).
// SÓ o gestor (diretoria/superuser). A flag mora em empresas_teste (sem privilégio para authenticated), então só esta rota, com o service role, a altera:
// nenhum analista consegue ligar ou desligar direto pelo PostgREST. Desmarcar NÃO normaliza propostas antigas: elas guardam o próprio propostas.teste.

type Contexto = { ctx: ContextoPropostas } | { erro: NextResponse };

async function contextoGestor(): Promise<Contexto> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const r = await exigirContextoPropostas(user);
  if (r.erro) return { erro: r.erro };
  if (!r.ctx.gestor) return { erro: NextResponse.json({ error: "Só a diretoria marca ou desmarca empresa de teste." }, { status: 403 }) };
  return { ctx: r.ctx };
}

// Gestor sem acesso a todas as unidades só alcança as empresas da própria unidade; empresa de outra unidade responde como inexistente.
async function carregarEmpresa(svc: ReturnType<typeof createServiceClient>, ctx: ContextoPropostas, id: string) {
  const { data } = await svc.from("empresas_visitadas").select("id, nome, unidade_id").eq("id", id).maybeSingle();
  if (!data) return null;
  if (!ctx.todasUnidades && ctx.unidadeId && data.unidade_id !== ctx.unidadeId) return null;
  return data;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await contextoGestor();
  if ("erro" in g) return g.erro;
  const { ctx } = g;

  const svc = createServiceClient();
  const empresa = await carregarEmpresa(svc, ctx, id);
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const { data: jaMarcada, error: erroLeitura } = await svc.from("empresas_teste").select("empresa_id").eq("empresa_id", id).maybeSingle();
  if (erroLeitura) return NextResponse.json({ error: "Não foi possível verificar a empresa. Nada foi alterado." }, { status: 500 });
  if (jaMarcada) return NextResponse.json({ data: { empresa_id: id, teste: true } });

  // Salvaguarda: empresa com negócio REAL não vira empresa de teste (esconderia propostas de verdade). Propostas já marcadas como teste não contam.
  const { data: opps, error: erroOpps } = await svc.from("oportunidades").select("id").eq("empresa_visitada_id", id).limit(1);
  const { data: reais, error: erroReais } = await svc.from("propostas").select("id").eq("empresa_visitada_id", id).eq("teste", false).limit(1);
  if (erroOpps || erroReais) return NextResponse.json({ error: "Não foi possível verificar o histórico da empresa. Nada foi alterado." }, { status: 500 });
  if ((opps ?? []).length > 0) {
    return NextResponse.json({ error: "Esta empresa tem oportunidades no Funil e não pode ser marcada como empresa de teste." }, { status: 409 });
  }
  if ((reais ?? []).length > 0) {
    return NextResponse.json({ error: "Esta empresa tem propostas reais e não pode ser marcada como empresa de teste." }, { status: 409 });
  }

  const { error } = await svc.from("empresas_teste").insert({ empresa_id: id, marcado_por: ctx.analistaId });
  if (error) {
    // 23505 = outra pessoa marcou no mesmo instante: o resultado é o mesmo.
    if (error.code === "23505") return NextResponse.json({ data: { empresa_id: id, teste: true } });
    return NextResponse.json({ error: "Não foi possível marcar a empresa. Nada foi alterado." }, { status: 500 });
  }

  registrarAuditoria({
    usuario_id: ctx.userId,
    acao: "empresa_teste_marcada",
    entidade: "empresas_visitadas",
    entidade_id: id,
    unidade_id: empresa.unidade_id,
    detalhes: { nome: empresa.nome },
  });
  return NextResponse.json({ data: { empresa_id: id, teste: true } }, { status: 201 });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await contextoGestor();
  if ("erro" in g) return g.erro;
  const { ctx } = g;

  const svc = createServiceClient();
  const empresa = await carregarEmpresa(svc, ctx, id);
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const { data: marcada, error: erroLeitura } = await svc.from("empresas_teste").select("empresa_id").eq("empresa_id", id).maybeSingle();
  if (erroLeitura) return NextResponse.json({ error: "Não foi possível verificar a empresa. Nada foi alterado." }, { status: 500 });
  if (!marcada) return NextResponse.json({ data: { empresa_id: id, teste: false } });

  const { error } = await svc.from("empresas_teste").delete().eq("empresa_id", id);
  if (error) return NextResponse.json({ error: "Não foi possível desmarcar a empresa. Nada foi alterado." }, { status: 500 });

  registrarAuditoria({
    usuario_id: ctx.userId,
    acao: "empresa_teste_desmarcada",
    entidade: "empresas_visitadas",
    entidade_id: id,
    unidade_id: empresa.unidade_id,
    detalhes: { nome: empresa.nome },
  });
  return NextResponse.json({ data: { empresa_id: id, teste: false } });
}
