import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolverUnidadeUsuario, podeVerUnidade } from "@/lib/unidadeAuth";

// Faturamento Unidades (ex-"Faturamento Hortolândia") — contas a receber/pagar e imposto do
// mês, sempre de UMA unidade por vez (decisão do Olver, 24/09: sem visão consolidada). As
// tabelas continuam com o nome "_hortolandia" (ver migration_faturamento_unidades_imposto_
// por_unidade.sql).

// Os lançamentos da unidade padrão são SÓ da operação de Hortolândia (Monte Mor não usa esse
// controle — confirmado pelo Olver em 24/09), então nesta tela ela aparece como
// "Hortolândia", não com o nome da unidade no resto do sistema. Casado pelo slug, que é
// fixo, e não pelo nome, que pode ser editado.
const NOME_NO_FATURAMENTO: Record<string, string> = {
  "monte-mor-hortolandia": "Hortolândia",
};

export function nomeUnidadeFaturamento(unidade: { slug: string; nome: string } | null | undefined): string {
  if (!unidade) return "—";
  return NOME_NO_FATURAMENTO[unidade.slug] ?? unidade.nome;
}

// Unidade em que a requisição opera. Sempre obrigatória e existente; quem não vê todas as
// unidades só opera na própria (hoje o módulo é só dos sócios, mas uma liberação individual
// não pode abrir o faturamento das outras unidades).
export async function resolverUnidadeFaturamento(
  user: User,
  unidadeId: string | null | undefined
): Promise<{ unidadeId: string; erro: null } | { unidadeId: null; erro: NextResponse }> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return { unidadeId: null, erro: NextResponse.json({ error: "Acesso restrito." }, { status: 403 }) };
  if (!unidadeId) return { unidadeId: null, erro: NextResponse.json({ error: "Unidade é obrigatória." }, { status: 400 }) };

  const svc = createServiceClient();
  const { data } = await svc.from("unidades").select("id").eq("id", unidadeId).maybeSingle();
  if (!data || !podeVerUnidade(ctx, data.id)) {
    return { unidadeId: null, erro: NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 }) };
  }
  return { unidadeId: data.id, erro: null };
}

// Pra rotas por id (editar/excluir um lançamento): a unidade é a do próprio lançamento.
export async function checarUnidadeLancamento(user: User, unidadeIdDoLancamento: string | null | undefined): Promise<NextResponse | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  if (!unidadeIdDoLancamento || !podeVerUnidade(ctx, unidadeIdDoLancamento)) {
    return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  }
  return null;
}

// Cliente de um recebimento tem que ser da mesma unidade do lançamento — senão o
// faturamento de SBC poderia listar recebimento de cliente de Hortolândia e vice-versa.
export async function checarClienteDaUnidade(clienteId: string, unidadeId: string): Promise<NextResponse | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("clientes").select("unidade_id").eq("id", clienteId).maybeSingle();
  if (!data || data.unidade_id !== unidadeId) {
    return NextResponse.json({ error: "O cliente escolhido não é desta unidade." }, { status: 400 });
  }
  return null;
}
