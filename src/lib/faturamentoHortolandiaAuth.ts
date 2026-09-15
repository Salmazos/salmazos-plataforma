import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

export async function podeAcessarFaturamentoHortolandia(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_FULL_ACCESS.includes(role);
  return podeAcessarAba(user, "faturamento_hortolandia", comportamentoPadrao);
}

export async function checarAcessoFaturamentoHortolandia(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarFaturamentoHortolandia(user))) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  return null;
}
