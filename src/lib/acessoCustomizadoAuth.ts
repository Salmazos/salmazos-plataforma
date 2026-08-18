import type { User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";

// Peça central do sistema de exceção de acesso por pessoa × aba (Fase 2a). Uso pretendido,
// módulo a módulo, numa fase futura separada: em vez de `checarComoEraAntes(user)` direto,
// o caller passa a chamar `podeAcessarAba(user, "chave_da_aba", checarComoEraAntes(user))` —
// o resultado por papel de hoje vira só o "comportamento padrão", nunca ignorado a não ser
// que exista uma exceção individual cadastrada. Isso permite adotar o helper aos poucos sem
// mudar nenhum comportamento até alguém abrir uma exceção de verdade na tela de
// /painel/configuracoes/acesso-customizado.
export async function podeAcessarAba(
  user: User,
  chaveAba: string,
  comportamentoPadraoPorPapel: boolean
): Promise<boolean> {
  const svc = createServiceClient();

  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!perfil) return comportamentoPadraoPorPapel;

  const { data: excecao } = await svc
    .from("usuario_acesso_customizado")
    .select("liberado")
    .eq("analista_perfil_id", perfil.id)
    .eq("chave_aba", chaveAba)
    .maybeSingle();

  // Exceção individual sempre vence — inclusive pra fechar acesso de quem o papel liberaria.
  if (excecao) return excecao.liberado;

  return comportamentoPadraoPorPapel;
}
