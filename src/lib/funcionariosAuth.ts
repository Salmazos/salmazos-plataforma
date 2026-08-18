import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Mesmo padrão de acesso restrito do painel de Admissões (ver podeAcessarAdmissoes em
// admissaoAuth.ts), com 'dp' incluído desde já: ninguém tem esse papel ainda (a Andreza,
// que hoje cuida do Departamento Pessoal, usa 'diretoria' e já cai nesta lista), mas a
// plataforma está sendo construída pensando na contratação futura de uma pessoa dedicada
// ao DP — que poderá receber só 'dp', sem acesso de diretoria/supervisor completo.
//
// Fase 2b — migrado pro sistema central de exceção (ver podeAcessarAba): comportamento
// padrão continua PAPEIS_PAINEL_FUNCIONARIOS, mas uma exceção individual em
// usuario_acesso_customizado (chave_aba "rh_funcionarios") sempre vence. Rescisões não tem
// checagem própria — herda esta mesma chave/função, ver comentário em rh_rescisoes no
// abasConfig.ts.
//
// Fonte única para TODOS os pontos de acesso do módulo Funcionários/Rescisões — páginas
// (redirect, via podeAcessarFuncionarios), rotas de API (checarPapelFuncionarios) e o flag
// do Sidebar (canAccessFuncionarios em painel/layout.tsx). Na Fase 1 este mesmo array
// existia duplicado inline em 3 lugares diferentes (aqui, em funcionarios/page.tsx e em
// layout.tsx) — nenhum deles tinha desviado ainda, mas era só questão de tempo até um
// editar um e esquecer o outro. Exportado para eliminar essa duplicação: qualquer novo
// gate do módulo importa isto em vez de reescrever o array.
export const PAPEIS_PAINEL_FUNCIONARIOS = ["superuser", "diretoria", "supervisor", "dp"];

export async function podeAcessarFuncionarios(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_PAINEL_FUNCIONARIOS.includes(role);
  return podeAcessarAba(user, "rh_funcionarios", comportamentoPadrao);
}

export async function checarPapelFuncionarios(user: User): Promise<NextResponse | null> {
  if (!(await podeAcessarFuncionarios(user))) {
    return NextResponse.json({ error: "Acesso restrito à equipe de RH." }, { status: 403 });
  }
  return null;
}
