import type { User } from "@supabase/supabase-js";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Dashboard restrito por padrão a PAPEIS_FULL_ACCESS (superuser/diretoria) — Fase 2b,
// migrado pro sistema central de exceção (ver podeAcessarAba). Sem rota de API dedicada (a
// tela inteira é montada no server component) — helper cobre só página (redirect) e menu
// (canAccessDashboard em painel/layout.tsx).
export async function podeAcessarDashboard(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_FULL_ACCESS.includes(role);
  return podeAcessarAba(user, "dashboard", comportamentoPadrao);
}
