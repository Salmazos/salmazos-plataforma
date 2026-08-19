import type { User } from "@supabase/supabase-js";
import { podeAcessarAba } from "@/lib/acessoCustomizadoAuth";

// Restrição decidida com o negócio: mesmo nível de "Carteira de Clientes" (comercial_carteira)
// — superuser/diretoria/supervisor, sem 'dp' (Relatórios não é escopo do Departamento
// Pessoal, ver comentário em painel/layout.tsx). Antes era blocklist (`role === "analista"`
// redireciona), trocado por allowlist explícita pra não deixar passar um papel novo (ex:
// 'dp') por padrão via URL direta — ver histórico em relatorios/page.tsx. Fase 2b, migrado
// pro sistema central de exceção (ver podeAcessarAba). Sem rota de API dedicada (a tela
// inteira é montada no server component) — helper cobre só página (redirect) e menu
// (canAccessRelatorios em painel/layout.tsx).
export const PAPEIS_RELATORIOS = ["superuser", "diretoria", "supervisor"];

export async function podeAcessarRelatorios(user: User): Promise<boolean> {
  const role = user.app_metadata?.role ?? "analista";
  const comportamentoPadrao = PAPEIS_RELATORIOS.includes(role);
  return podeAcessarAba(user, "relatorios", comportamentoPadrao);
}
