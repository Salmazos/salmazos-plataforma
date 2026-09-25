import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALISTAS, ANALISTAS_NOME_COMPLETO } from "@/lib/constants";
import { nomesCompletosDaUnidade } from "@/lib/responsaveis";

export interface DestinatarioPosVenda {
  user_id: string;
  email: string;
  nome: string;
}

// Resolve clientes.responsavel_comercial (nome curto de ANALISTAS nos cadastros atuais,
// ou nome completo em registros legados) pra quem deve receber a notificação de
// pós-venda R&S. Sem responsável cadastrado, ou responsável não encontrado/inativo em
// analistas_perfil, cai pro broadcast do time comercial inteiro (pedido explícito do
// Ölver, 14/09) em vez de não notificar ninguém. "Time comercial" = quem está em ANALISTAS
// (não existe nível de acesso "comercial" em analistas_perfil).
//
// Com a unidade do cliente, tudo fica restrito a ela (SBC entrou em 25/09): o responsável é
// procurado entre os logins daquela unidade — a Susana tem login em Monte Mor e em SBC com o
// mesmo nome, e sem esse filtro a busca achava dois e caía no broadcast — e o broadcast vai
// só pro time comercial da unidade.
export async function resolverDestinatariosPosVenda(
  responsavelComercial: string | null | undefined,
  supabase: SupabaseClient,
  unidadeId?: string | null
): Promise<DestinatarioPosVenda[]> {
  let unidadeSlug: string | null = null;
  if (unidadeId) {
    const { data: unidade } = await supabase.from("unidades").select("slug").eq("id", unidadeId).maybeSingle();
    unidadeSlug = unidade?.slug ?? null;
  }

  if (responsavelComercial) {
    const nomeCompleto =
      ANALISTAS_NOME_COMPLETO[responsavelComercial as (typeof ANALISTAS)[number]] ??
      responsavelComercial;

    let busca = supabase
      .from("analistas_perfil")
      .select("user_id, email, nome_completo")
      .eq("nome_completo", nomeCompleto)
      .eq("ativo", true)
      .not("email", "is", null);
    if (unidadeId) busca = busca.or(`unidade_id.eq.${unidadeId},acesso_todas_unidades.eq.true`);
    const { data: analista } = await busca.maybeSingle();

    if (analista?.user_id && analista.email) {
      return [{ user_id: analista.user_id, email: analista.email, nome: analista.nome_completo }];
    }
  }

  let buscaTime = supabase
    .from("analistas_perfil")
    .select("user_id, email, nome_completo")
    .in("nome_completo", nomesCompletosDaUnidade(unidadeSlug))
    .eq("ativo", true)
    .not("email", "is", null);
  if (unidadeId) buscaTime = buscaTime.eq("unidade_id", unidadeId);
  const { data: timeComercial } = await buscaTime;

  return (timeComercial ?? []).map((a) => ({
    user_id: a.user_id as string,
    email: a.email as string,
    nome: a.nome_completo as string,
  }));
}
