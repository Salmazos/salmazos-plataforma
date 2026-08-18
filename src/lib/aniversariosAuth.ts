import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Aniversários é o único módulo do grupo RH aberto por padrão a qualquer autenticado, sem
// checagem de papel (comportamentoPadrao fica travado em `true`) — a matriz de exceção em
// usuario_acesso_customizado (chave_aba "rh_aniversarios") por enquanto só serve pra FECHAR
// acesso de alguém específico se um dia for necessário, nunca pra abrir (já está aberto pra
// todo mundo). Cobre as rotas em src/app/api/aniversariantes/**, que antes não tinham
// nenhum gate de papel além do `if (!user)`.
export async function checarAcessoAniversarios(user: User): Promise<NextResponse | null> {
  const acesso = await podeAcessarAba(user, "rh_aniversarios", true);
  if (!acesso) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}
