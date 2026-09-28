import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Mesmo padrão de acesso do módulo Funcionários (ver funcionariosAuth.ts) — o Espelho de
// Ponto é um módulo do RH, então usa o mesmo conjunto de papéis por padrão, com exceção
// individual possível via usuario_acesso_customizado (chave_aba "rh_ponto").
export const PAPEIS_PAINEL_PONTO = ["superuser", "diretoria", "supervisor", "dp"];

export async function podeAcessarPonto(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_PAINEL_PONTO.includes(role);
  return podeAcessarAba(user, "rh_ponto", comportamentoPadrao);
}

export async function checarPapelPonto(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarPonto(user))) {
    return NextResponse.json({ error: "Acesso restrito à equipe de RH." }, { status: 403 });
  }
  return null;
}
