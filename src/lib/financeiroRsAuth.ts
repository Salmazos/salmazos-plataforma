import type { User } from "@supabase/supabase-js";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Financeiro R&S restrito por padrão a PAPEIS_FULL_ACCESS (superuser/diretoria) — Fase 2b,
// migrado pro sistema central de exceção (ver podeAcessarAba). Diferente de Cobranças R&S,
// não tem nenhum mecanismo de liberação individual próprio — a exceção em
// usuario_acesso_customizado (chave_aba "financeiro_rs") é a única forma de abrir acesso pra
// quem não é full access. Sem rota de API dedicada (a tela inteira é montada no server
// component) — este helper cobre só página (redirect) e menu (canAccessFinanceiroRs em
// painel/layout.tsx), mesma função nos dois pontos, pra nunca divergir.
export async function podeAcessarFinanceiroRs(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_FULL_ACCESS.includes(role);
  return podeAcessarAba(user, "financeiro_rs", comportamentoPadrao);
}
