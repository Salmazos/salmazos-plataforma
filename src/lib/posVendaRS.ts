import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALISTAS, ANALISTAS_NOME_COMPLETO } from "@/lib/constants";

export interface DestinatarioPosVenda {
  user_id: string;
  email: string;
  nome: string;
}

// Todo o "time comercial" conhecido — usado como fallback de broadcast quando o cliente
// não tem responsável comercial identificável. Não existe nível de acesso "comercial" em
// analistas_perfil.nivel_acesso; quem pode ser responsável comercial é justamente quem
// está na lista ANALISTAS (mesma lista usada no <select> de ModalNovoCliente).
const NOMES_COMPLETOS_TIME_COMERCIAL = ANALISTAS.map((a) => ANALISTAS_NOME_COMPLETO[a]);

// Resolve clientes.responsavel_comercial (nome curto de ANALISTAS nos cadastros atuais,
// ou nome completo em registros legados) pra quem deve receber a notificação de
// pós-venda R&S. Sem responsável cadastrado, ou responsável não encontrado/inativo em
// analistas_perfil, cai pro broadcast do time comercial inteiro (pedido explícito do
// Ölver, 14/09) em vez de não notificar ninguém.
export async function resolverDestinatariosPosVenda(
  responsavelComercial: string | null | undefined,
  supabase: SupabaseClient
): Promise<DestinatarioPosVenda[]> {
  if (responsavelComercial) {
    const nomeCompleto =
      ANALISTAS_NOME_COMPLETO[responsavelComercial as (typeof ANALISTAS)[number]] ??
      responsavelComercial;

    const { data: analista } = await supabase
      .from("analistas_perfil")
      .select("user_id, email, nome_completo")
      .eq("nome_completo", nomeCompleto)
      .eq("ativo", true)
      .not("email", "is", null)
      .maybeSingle();

    if (analista?.user_id && analista.email) {
      return [{ user_id: analista.user_id, email: analista.email, nome: analista.nome_completo }];
    }
  }

  const { data: timeComercial } = await supabase
    .from("analistas_perfil")
    .select("user_id, email, nome_completo")
    .in("nome_completo", NOMES_COMPLETOS_TIME_COMERCIAL)
    .eq("ativo", true)
    .not("email", "is", null);

  return (timeComercial ?? []).map((a) => ({
    user_id: a.user_id as string,
    email: a.email as string,
    nome: a.nome_completo as string,
  }));
}
