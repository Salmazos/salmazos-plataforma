import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Mesmo padrão de acesso restrito do painel de Admissões (ver checarPapelAdmissoes em
// admissaoAuth.ts), com 'dp' incluído desde já: ninguém tem esse papel ainda (a Andreza,
// que hoje cuida do Departamento Pessoal, usa 'diretoria' e já cai nesta lista), mas a
// plataforma está sendo construída pensando na contratação futura de uma pessoa dedicada
// ao DP — que poderá receber só 'dp', sem acesso de diretoria/supervisor completo.
const PAPEIS_PAINEL_FUNCIONARIOS = ["superuser", "diretoria", "supervisor", "dp"];

export function checarPapelFuncionarios(user: User): NextResponse | null {
  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_FUNCIONARIOS.includes(role)) {
    return NextResponse.json({ error: "Acesso restrito à equipe de RH." }, { status: 403 });
  }
  return null;
}
