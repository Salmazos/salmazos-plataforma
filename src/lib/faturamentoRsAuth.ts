import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Faturamento R&S restrito por padrão a PAPEIS_FULL_ACCESS (superuser/diretoria) — Fase 2b,
// migrado pro sistema central de exceção (ver podeAcessarAba). Diferente de Cobranças R&S,
// não usa checarAcessoCobrancaRS — analistas com acesso configurável só à tela de Cobranças
// (ex: Giovanni) não ganham acesso aqui por tabela; só a exceção em
// usuario_acesso_customizado (chave_aba "faturamento_rs") abre acesso pra quem não é full
// access. Fonte única pros três pontos do módulo: página (redirect), as 4 rotas de API
// (route.ts, ajustes, historico, imposto) e o menu — mesma função em todos, pra nunca
// divergir.
export async function podeAcessarFaturamentoRs(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_FULL_ACCESS.includes(role);
  return podeAcessarAba(user, "faturamento_rs", comportamentoPadrao);
}

export async function checarAcessoFaturamentoRs(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarFaturamentoRs(user))) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}
