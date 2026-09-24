import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Retrofit multi-unidade (SBC), Fase 3. Quase toda rota usa createServiceClient() (ignora
// RLS), então a trava real de unidade é este código, não o banco — RLS por unidade só
// entra como reforço na Fase 4.
//
// Regra de escopo confirmada com o Olver (23/09): o banco de CANDIDATOS é compartilhado
// entre as unidades. O que separa as unidades é a VAGA (vagas.unidade_id) — o Kanban e tudo
// que é candidatos_vagas herda a unidade pela vaga. Nunca filtrar candidatos por unidade.

export interface ContextoUnidade {
  unidadeId: string;
  // true (hoje: diretoria/superuser, sócios de SBC) = quem chama NÃO aplica filtro de
  // unidade. Campo estático em analistas_perfil — não se atualiza sozinho quando alguém é
  // promovido (pendência de arquitetura da Fase 1, ver migration_sbc_multiunidade_fase1).
  todasUnidades: boolean;
}

// null = usuário sem analistas_perfil (ex: login do Portal do Cliente, conta sem papel).
// Quem chama nega o acesso em vez de assumir uma unidade — regra do projeto de nunca
// decidir "no escuro".
export async function resolverUnidadeUsuario(user: User): Promise<ContextoUnidade | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("analistas_perfil")
    .select("unidade_id, acesso_todas_unidades")
    .eq("user_id", user.id)
    .maybeSingle();
  // Falha de banco também nega (null), mas fica no log pra não se confundir com "usuário
  // realmente sem perfil" quando alguém reclamar de 403.
  if (error) console.error(`[unidadeAuth] Erro ao resolver unidade do usuário ${user.id}:`, error.message);
  if (!data?.unidade_id) return null;
  return { unidadeId: data.unidade_id, todasUnidades: data.acesso_todas_unidades === true };
}

// Portal do Cliente: quem loga é o cliente, não um analista — a unidade vem sempre do
// cadastro do cliente (clientes.unidade_id), nunca de analistas_perfil. Uma vaga criada a
// partir de solicitação do portal herda a unidade do cliente que pediu, não a de quem
// processa no painel.
export async function resolverUnidadeCliente(clienteId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("clientes").select("unidade_id").eq("id", clienteId).maybeSingle();
  return data?.unidade_id ?? null;
}

export function podeVerUnidade(ctx: ContextoUnidade, unidadeId: string | null | undefined): boolean {
  return ctx.todasUnidades || unidadeId === ctx.unidadeId;
}

const RESPOSTA_SEM_PERFIL = () => NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
// 404 (não 403) quando o registro é de outra unidade: não confirma pra quem está de fora
// que aquele id existe.
const RESPOSTA_NAO_ENCONTRADO = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });

// Pra rotas de listagem: devolve o contexto, ou a resposta de erro pronta quando o usuário
// não tem perfil de analista.
export async function obterContextoUnidade(
  user: User
): Promise<{ ctx: ContextoUnidade; erro: null } | { ctx: null; erro: NextResponse }> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return { ctx: null, erro: RESPOSTA_SEM_PERFIL() };
  return { ctx, erro: null };
}

// Pra rotas que recebem o id de uma vaga: null = pode seguir; senão, a resposta de erro.
export async function checarAcessoVaga(user: User, vagaId: string): Promise<NextResponse | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return RESPOSTA_SEM_PERFIL();
  if (ctx.todasUnidades) return null;

  const svc = createServiceClient();
  const { data } = await svc.from("vagas").select("unidade_id").eq("id", vagaId).maybeSingle();
  if (!data || !podeVerUnidade(ctx, data.unidade_id)) return RESPOSTA_NAO_ENCONTRADO();
  return null;
}

// Mesmo que checarAcessoVaga, a partir do id de um candidatos_vagas (a unidade vem da vaga).
export async function checarAcessoCandidatoVaga(user: User, candidatoVagaId: string): Promise<NextResponse | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return RESPOSTA_SEM_PERFIL();
  if (ctx.todasUnidades) return null;

  const svc = createServiceClient();
  // ⚠️ FK explícita obrigatória — existem duas FKs entre candidatos_vagas e vagas (ver
  // CLAUDE.md, seção "Ambiguidade de FK").
  const { data } = await svc
    .from("candidatos_vagas")
    .select("vagas!candidatos_vagas_vaga_id_fkey(unidade_id)")
    .eq("id", candidatoVagaId)
    .maybeSingle();
  // PostgREST devolve o embed many-to-one como objeto, mas o tipo inferido é array.
  const unidadeId = (data?.vagas as unknown as { unidade_id: string } | null)?.unidade_id;
  if (!data || !podeVerUnidade(ctx, unidadeId)) return RESPOSTA_NAO_ENCONTRADO();
  return null;
}

// Pra rotas que recebem o id de um cliente (cadastro, logo, atenção especial, acesso ao
// portal): cliente de outra unidade responde como inexistente.
export async function checarAcessoCliente(user: User, clienteId: string): Promise<NextResponse | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return RESPOSTA_SEM_PERFIL();
  if (ctx.todasUnidades) return null;

  const unidadeId = await resolverUnidadeCliente(clienteId);
  if (!unidadeId || !podeVerUnidade(ctx, unidadeId)) return RESPOSTA_NAO_ENCONTRADO();
  return null;
}

// Contato aniversariante tem unidade própria (aniversariantes_contatos.unidade_id — do cliente
// vinculado, ou de quem cadastrou quando é só empresa em texto livre).
export async function checarAcessoAniversariante(user: User, contatoId: string): Promise<NextResponse | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return RESPOSTA_SEM_PERFIL();
  if (ctx.todasUnidades) return null;

  const svc = createServiceClient();
  const { data } = await svc.from("aniversariantes_contatos").select("unidade_id").eq("id", contatoId).maybeSingle();
  if (!data || !podeVerUnidade(ctx, data.unidade_id)) return RESPOSTA_NAO_ENCONTRADO();
  return null;
}

// Encaminhamento (candidato → entrevista num cliente) herda a unidade do CLIENTE — todo
// encaminhamento tem cliente_id, vaga_id é opcional (conferido em 23/09: 134/134 com
// cliente, nenhum com vaga e cliente em unidades diferentes).
export async function checarAcessoEncaminhamento(user: User, encaminhamentoId: string): Promise<NextResponse | null> {
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return RESPOSTA_SEM_PERFIL();
  if (ctx.todasUnidades) return null;

  const svc = createServiceClient();
  const { data } = await svc
    .from("encaminhamentos")
    .select("cliente:clientes(unidade_id)")
    .eq("id", encaminhamentoId)
    .maybeSingle();
  // PostgREST devolve o embed many-to-one como objeto, mas o tipo inferido é array.
  const unidadeId = (data?.cliente as unknown as { unidade_id: string } | null)?.unidade_id;
  if (!data || !podeVerUnidade(ctx, unidadeId)) return RESPOSTA_NAO_ENCONTRADO();
  return null;
}

// Candidato é compartilhado, mas algumas rotas por candidato (etapa, responsável) atualizam
// TODAS as candidaturas dele de uma vez. Devolve os ids das candidaturas em vagas da unidade
// de quem está mexendo, pra essas rotas não alterarem o processo de outra unidade. null =
// sem restrição (acesso a todas as unidades).
export async function idsCandidaturasDaUnidade(ctx: ContextoUnidade, candidatoId: string): Promise<string[] | null> {
  if (ctx.todasUnidades) return null;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("candidatos_vagas")
    .select("id, vagas!candidatos_vagas_vaga_id_fkey!inner(unidade_id)")
    .eq("candidato_id", candidatoId)
    .eq("vagas.unidade_id", ctx.unidadeId);
  // Em falha de banco devolve [] (não altera nenhuma candidatura), mas registra no log.
  if (error) console.error(`[unidadeAuth] Erro ao listar candidaturas da unidade (candidato_id=${candidatoId}):`, error.message);
  return (data ?? []).map((r) => r.id as string);
}

// Unidade de um filtro de tela gerencial (Dashboard, Relatórios, Financeiro): quem vê todas as
// unidades escolhe (?unidade=<id>; ausente ou inválido = null = todas); os demais ficam
// sempre na própria unidade, independente do que vier na URL.
export async function resolverFiltroUnidade(ctx: ContextoUnidade, unidadeParam: string | null | undefined): Promise<string | null> {
  if (!ctx.todasUnidades) return ctx.unidadeId;
  if (!unidadeParam) return null;
  const svc = createServiceClient();
  const { data } = await svc.from("unidades").select("id").eq("id", unidadeParam).maybeSingle();
  return data?.id ?? null;
}

// Filtro PostgREST (.or) das notificações do sino que um usuário enxerga: as direcionadas a
// ele + os avisos gerais (user_id nulo) sem unidade ou da unidade dele. Sem contexto (sem
// perfil de analista) só vê os gerais sem unidade; acesso a todas as unidades vê todos.
export function filtroNotificacoesVisiveis(userId: string, ctx: ContextoUnidade | null): string {
  if (ctx?.todasUnidades) return `user_id.eq.${userId},user_id.is.null`;
  const geraisDaUnidade = ctx ? `,and(user_id.is.null,unidade_id.eq.${ctx.unidadeId})` : "";
  return `user_id.eq.${userId},and(user_id.is.null,unidade_id.is.null)${geraisDaUnidade}`;
}

// Atalhos pras rotas que ainda não resolviam o usuário logado: o middleware já exige
// sessão em /api (fora das rotas públicas), mas a rota precisa do User pra saber a unidade.
async function usuarioDaSessao(): Promise<User | null> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  return user;
}

const RESPOSTA_NAO_AUTORIZADO = () => NextResponse.json({ error: "Não autorizado" }, { status: 401 });

export async function exigirContextoUnidade(): Promise<
  { ctx: ContextoUnidade; erro: null } | { ctx: null; erro: NextResponse }
> {
  const user = await usuarioDaSessao();
  if (!user) return { ctx: null, erro: RESPOSTA_NAO_AUTORIZADO() };
  return obterContextoUnidade(user);
}

export async function exigirAcessoVaga(vagaId: string): Promise<NextResponse | null> {
  const user = await usuarioDaSessao();
  if (!user) return RESPOSTA_NAO_AUTORIZADO();
  return checarAcessoVaga(user, vagaId);
}

export async function exigirAcessoEncaminhamento(encaminhamentoId: string): Promise<NextResponse | null> {
  const user = await usuarioDaSessao();
  if (!user) return RESPOSTA_NAO_AUTORIZADO();
  return checarAcessoEncaminhamento(user, encaminhamentoId);
}

export async function exigirAcessoCandidatoVaga(candidatoVagaId: string): Promise<NextResponse | null> {
  const user = await usuarioDaSessao();
  if (!user) return RESPOSTA_NAO_AUTORIZADO();
  return checarAcessoCandidatoVaga(user, candidatoVagaId);
}

// Pra páginas server-side (Server Components), que não devolvem NextResponse: null quando o
// usuário não tem perfil de analista — a página decide (notFound/redirect).
export async function contextoUnidadeDaSessao(): Promise<ContextoUnidade | null> {
  const user = await usuarioDaSessao();
  if (!user) return null;
  return resolverUnidadeUsuario(user);
}
