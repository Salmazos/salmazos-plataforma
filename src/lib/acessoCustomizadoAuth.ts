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

// Lê só a exceção individual cadastrada (true = liberado, false = bloqueado, null = sem exceção). O podeAcessarAba
// mistura exceção e padrão num único booleano; quem precisa distinguir "liberado de propósito" do "padrão do papel"
// (ex.: Propostas, onde liberar dá direito de escrever e o padrão de gestor só lê) usa esta. Diferente do podeAcessarAba
// (que, num erro de leitura, cai no padrão do papel), aqui o erro é devolvido: quem chama decide negar o acesso, porque
// "não consegui ler" não pode virar "não há bloqueio" (liberado=false precisa valer mesmo com o banco falhando).
export async function excecaoExplicitaAba(
  analistaPerfilId: string,
  chaveAba: string
): Promise<{ erro: false; excecao: boolean | null } | { erro: true }> {
  const { data, error } = await createServiceClient()
    .from("usuario_acesso_customizado")
    .select("liberado")
    .eq("analista_perfil_id", analistaPerfilId)
    .eq("chave_aba", chaveAba)
    .maybeSingle();
  if (error) {
    console.error("[acesso] Não foi possível ler a exceção de acesso:", chaveAba, error.message);
    return { erro: true };
  }
  return { erro: false, excecao: data ? data.liberado === true : null };
}
