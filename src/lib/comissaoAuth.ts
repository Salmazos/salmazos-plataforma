import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { resolverUnidadeUsuario } from "@/lib/unidadeAuth";
import type { Ator, Beneficiario } from "@/lib/comissao";
import { resolverNomeUsuario } from "@/lib/audit";

// Acesso ao módulo Comissões (Fase 1), pelo sistema central de exceção (podeAcessarAba):
// - "comissoes_minhas": quem é beneficiário ATIVO (comissao_beneficiarios) vê as próprias comissões;
// - "comissoes": diretoria e superuser (PAPEIS_FULL_ACCESS) veem todas e contestam/aprovam.
// A exceção individual (usuario_acesso_customizado) vence o padrão, inclusive para fechar. Nenhum módulo existente muda de acesso.
export const CHAVE_ABA_COMISSOES_MINHAS = "comissoes_minhas";
export const CHAVE_ABA_COMISSOES = "comissoes";

export interface AcessoComissoes {
  minhas: boolean;
  diretoria: boolean;
  beneficiario: Beneficiario | null;
}

// No máximo 2 consultas, em paralelo, e só em tabelas pequenas: o beneficiário (comissao_beneficiarios, por analista) e as exceções
// de aba desta pessoa (usuario_acesso_customizado, as duas chaves de uma vez). Quem já tem o perfil carregado (o layout do painel)
// passa `perfil` e economiza a consulta ao perfil; sem ele, resolve 1 vez. Mesma regra de podeAcessarAba: a exceção individual
// vence o padrão (que é: "minhas" = ser beneficiário ativo; "diretoria" = papel superuser/diretoria).
export async function resolverAcessoComissoes(
  user: User,
  perfil?: { id: string; nome_completo?: string | null } | null
): Promise<AcessoComissoes> {
  const svc = createServiceClient();
  const role = user.app_metadata?.role ?? "analista";
  const padraoDiretoria = PAPEIS_FULL_ACCESS.includes(role);

  const p = perfil ?? (await svc.from("analistas_perfil").select("id, nome_completo").eq("user_id", user.id).maybeSingle()).data;
  // Sem perfil de analista não há beneficiário nem exceção individual: vale só o padrão do papel (igual a podeAcessarAba).
  if (!p) return { minhas: false, diretoria: padraoDiretoria, beneficiario: null };

  const [{ data: ben }, { data: excecoes }] = await Promise.all([
    svc.from("comissao_beneficiarios").select("id, analista_perfil_id, percentual, ativo, unidade_id").eq("analista_perfil_id", p.id).eq("ativo", true).maybeSingle(),
    svc.from("usuario_acesso_customizado").select("chave_aba, liberado").eq("analista_perfil_id", p.id).in("chave_aba", [CHAVE_ABA_COMISSOES_MINHAS, CHAVE_ABA_COMISSOES]),
  ]);
  const excecao = (chave: string): boolean | null => {
    const e = (excecoes ?? []).find((x) => x.chave_aba === chave);
    return e ? e.liberado === true : null;
  };
  const beneficiario: Beneficiario | null = ben ? ({ ...ben, percentual: Number(ben.percentual), nome_completo: p.nome_completo ?? null } as Beneficiario) : null;
  return {
    minhas: beneficiario !== null && (excecao(CHAVE_ABA_COMISSOES_MINHAS) ?? true),
    diretoria: excecao(CHAVE_ABA_COMISSOES) ?? padraoDiretoria,
    beneficiario,
  };
}

export async function atorDoUsuario(user: User): Promise<Ator> {
  return { id: user.id, nome: (await resolverNomeUsuario(user.id, user.email ?? null, createServiceClient())) ?? user.email ?? null };
}

// Unidade que a diretoria pode ver: null = todas (acesso_todas_unidades); exceção concedida a quem é de uma unidade só enxerga a dela.
export async function unidadeVisivelParaDiretoria(user: User): Promise<{ unidadeId: string | null } | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return null;
  return { unidadeId: ctx.todasUnidades ? null : ctx.unidadeId };
}

export const RESPOSTA_NEGADA = () => NextResponse.json({ error: "Acesso restrito." }, { status: 403 });

// ── Portões das rotas ────────────────────────────────────────────────────────────────────────────────────────────────

export async function exigirBeneficiario(): Promise<{ user: User; ator: Ator; beneficiario: Beneficiario } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const acesso = await resolverAcessoComissoes(user);
  if (!acesso.minhas || !acesso.beneficiario) return RESPOSTA_NEGADA();
  return { user, ator: await atorDoUsuario(user), beneficiario: acesso.beneficiario };
}

export async function exigirDiretoria(): Promise<{ user: User; ator: Ator; unidadeId: string | null } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const acesso = await resolverAcessoComissoes(user);
  if (!acesso.diretoria) return RESPOSTA_NEGADA();
  const vis = await unidadeVisivelParaDiretoria(user);
  if (!vis) return RESPOSTA_NEGADA();
  return { user, ator: await atorDoUsuario(user), unidadeId: vis.unidadeId };
}

// 404 (não 403) quando o lançamento é de outra unidade, para não confirmar que o id existe.
export async function lancamentoNaUnidade(lancamentoId: string, unidadeId: string | null): Promise<boolean> {
  const { data } = await createServiceClient().from("comissao_lancamentos").select("unidade_id").eq("id", lancamentoId).maybeSingle();
  if (!data) return false;
  return unidadeId === null || data.unidade_id === unidadeId;
}
