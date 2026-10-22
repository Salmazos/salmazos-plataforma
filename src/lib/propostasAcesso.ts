import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { excecaoExplicitaAba } from "@/lib/acessoCustomizadoAuth";
import type { ContextoComercial } from "@/lib/comercial";

export const CHAVE_ABA_PROPOSTAS = "comercial_propostas";
export const MSG_SEM_ACESSO_PROPOSTAS = "Você não tem acesso a Propostas.";
export const MSG_SO_ACOMPANHA_PROPOSTAS = "Seu perfil só acompanha as propostas, não cria.";

// `vendedor` (herdado) = perfil_comercial: é o "temFunil" que o Funil sempre usou. `podeEscrever` é o direito de
// criar/editar/mudar situação em Propostas, que também vem de uma liberação individual.
export interface ContextoPropostas extends ContextoComercial {
  podeEscrever: boolean;
  temFunil: boolean;
}

// Fonte única do acesso a Propostas (menu, páginas e rotas):
//  - acessar = analista ativo E (exceção individual, se houver; senão perfil_comercial OU gestor). Mesma conta do
//    podeAcessarAba, mas lendo a exceção uma vez só para também separar "liberado de propósito" do padrão.
//    liberado=false bloqueia tudo, inclusive quem tem perfil_comercial e o gestor. Erro ao ler a exceção = acesso negado.
//  - escrever = acessar E (perfil_comercial OU liberado=true). O gestor só pelo padrão apenas lê.
//  - temFunil = perfil_comercial ATUAL de quem faz a ação.
export async function resolverContextoPropostas(user: User): Promise<ContextoPropostas | null> {
  const svc = createServiceClient();
  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id, nivel_acesso, unidade_id, acesso_todas_unidades, perfil_comercial, ativo")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!perfil || perfil.ativo === false) return null;

  const role = user.app_metadata?.role ?? "analista";
  const perfilComercial = perfil.perfil_comercial === true;
  const gestor = role === "superuser" || perfil.nivel_acesso === "diretoria" || perfil.nivel_acesso === "superuser";
  const leitura = await excecaoExplicitaAba(perfil.id, CHAVE_ABA_PROPOSTAS);
  // Não conseguir ler a exceção nega o acesso (falha segura): um liberado=false não pode ser ignorado por causa de um erro.
  if (leitura.erro) return null;
  const excecao = leitura.excecao;

  const acessa = excecao ?? (perfilComercial || gestor);
  if (!acessa) return null;
  return {
    userId: user.id,
    analistaId: perfil.id,
    unidadeId: perfil.unidade_id ?? null,
    vendedor: perfilComercial,
    gestor,
    todasUnidades: perfil.acesso_todas_unidades === true,
    podeEscrever: perfilComercial || excecao === true,
    temFunil: perfilComercial,
  };
}

export async function podeAcessarPropostas(user: User): Promise<boolean> {
  return (await resolverContextoPropostas(user)) !== null;
}

export async function exigirContextoPropostas(
  user: User | null
): Promise<{ ctx: ContextoPropostas; erro: null } | { ctx: null; erro: NextResponse }> {
  if (!user) return { ctx: null, erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const ctx = await resolverContextoPropostas(user);
  if (!ctx) return { ctx: null, erro: NextResponse.json({ error: MSG_SEM_ACESSO_PROPOSTAS }, { status: 403 }) };
  return { ctx, erro: null };
}

// Filtro de vendedor do gestor: quem hoje pode escrever em Propostas (perfil_comercial ou liberado=true), ativo e sem bloqueio.
// Falha segura: se não for possível ler os perfis ou as exceções (sem elas não dá para saber quem está bloqueado), a lista vem vazia.
export async function listarQuemPodeEscreverPropostas(
  svc: ReturnType<typeof createServiceClient>,
  alcance: { unidadeId: string | null; todasUnidades: boolean }
): Promise<{ id: string; nome_completo: string }[]> {
  let q = svc.from("analistas_perfil").select("id, nome_completo, perfil_comercial").eq("ativo", true).order("nome_completo");
  if (!alcance.todasUnidades && alcance.unidadeId) q = q.eq("unidade_id", alcance.unidadeId);
  const [{ data: perfis, error: erroPerfis }, { data: excecoes, error: erroExcecoes }] = await Promise.all([
    q,
    svc.from("usuario_acesso_customizado").select("analista_perfil_id, liberado").eq("chave_aba", CHAVE_ABA_PROPOSTAS),
  ]);
  if (erroPerfis || erroExcecoes) {
    console.error("[propostas] Filtro de vendedores indisponível:", (erroPerfis ?? erroExcecoes)?.message);
    return [];
  }
  const porAnalista = new Map((excecoes ?? []).map((e) => [e.analista_perfil_id as string, e.liberado === true]));
  return (perfis ?? [])
    .filter((p) => {
      const excecao = porAnalista.get(p.id as string);
      if (excecao === false) return false;
      return p.perfil_comercial === true || excecao === true;
    })
    .map((p) => ({ id: p.id as string, nome_completo: p.nome_completo as string }));
}
