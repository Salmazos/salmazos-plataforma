import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Aniversários é o único módulo do grupo RH aberto por padrão a qualquer autenticado, sem
// checagem de papel (comportamentoPadrao fica travado em `true`) — a matriz de exceção em
// usuario_acesso_customizado (chave_aba "rh_aniversarios") por enquanto só serve pra FECHAR
// acesso de alguém específico se um dia for necessário, nunca pra abrir (já está aberto pra
// todo mundo). Fonte única pros três pontos de acesso do módulo: rotas de API (em
// src/app/api/aniversariantes/**, via checarAcessoAniversarios), página
// (painel/aniversarios/page.tsx, via podeAcessarAniversarios) e o Sidebar
// (canAccessAniversarios em painel/layout.tsx) — mesmo padrão de podeAcessarFuncionarios/
// podeAcessarAdmissoes, pra nunca divergir entre o que o menu mostra e o que a API aceita.
export async function podeAcessarAniversarios(user: User): Promise<boolean> {
  return podeAcessarAba(user, "rh_aniversarios", true);
}

export async function checarAcessoAniversarios(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarAniversarios(user))) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}
