import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Mesmo padrão de acesso restrito do painel de Admissões (ver checarPapelAdmissoes em
// admissaoAuth.ts), com 'dp' incluído desde já: ninguém tem esse papel ainda (a Andreza,
// que hoje cuida do Departamento Pessoal, usa 'diretoria' e já cai nesta lista), mas a
// plataforma está sendo construída pensando na contratação futura de uma pessoa dedicada
// ao DP — que poderá receber só 'dp', sem acesso de diretoria/supervisor completo.
//
// Fonte única para TODOS os pontos de acesso do módulo Funcionários/Rescisões — páginas
// (redirect), rotas de API (checarPapelFuncionarios) e o flag do Sidebar (canAccessFuncionarios
// em painel/layout.tsx). Na Fase 1 este mesmo array existia duplicado inline em 3 lugares
// diferentes (aqui, em funcionarios/page.tsx e em layout.tsx) — nenhum deles tinha desviado
// ainda, mas era só questão de tempo até um editar um e esquecer o outro. Exportado para
// eliminar essa duplicação: qualquer novo gate do módulo (ex: Rescisões, Fase 2) importa
// isto em vez de reescrever o array.
export const PAPEIS_PAINEL_FUNCIONARIOS = ["superuser", "diretoria", "supervisor", "dp"];

export function checarPapelFuncionarios(user: User): NextResponse | null {
  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_PAINEL_FUNCIONARIOS.includes(role)) {
    return NextResponse.json({ error: "Acesso restrito à equipe de RH." }, { status: 403 });
  }
  return null;
}
