import { ANALISTAS, ANALISTAS_NOME_COMPLETO, ANALISTA_UNIDADE_SLUG, type Analista } from "@/lib/constants";

// Listas de "Responsável" por unidade + regra de sempre sugerir quem está logado (decisão do
// Olver, 25/09). Sem dependência de servidor — usado nos formulários do painel.

// Time da unidade (nomes curtos, o que vagas.responsavel e clientes.responsavel_comercial
// gravam). Sem unidade conhecida (ex: sócio numa tela sem vaga/cliente) = todos.
export function responsaveisDaUnidade(unidadeSlug: string | null | undefined): Analista[] {
  if (!unidadeSlug) return [...ANALISTAS];
  return ANALISTAS.filter((a) => ANALISTA_UNIDADE_SLUG[a] === unidadeSlug);
}

// Mesmo time, em nome completo (o que candidatos.responsavel grava).
export function nomesCompletosDaUnidade(unidadeSlug: string | null | undefined): string[] {
  return responsaveisDaUnidade(unidadeSlug).map((a) => ANALISTAS_NOME_COMPLETO[a]);
}

// Nome completo de analistas_perfil → nome curto de ANALISTAS (null se não for do time).
export function apelidoDoNomeCompleto(nomeCompleto: string | null | undefined): Analista | null {
  if (!nomeCompleto) return null;
  return ANALISTAS.find((a) => ANALISTAS_NOME_COMPLETO[a] === nomeCompleto.trim()) ?? null;
}

// Valor inicial de um <select> de responsável num cadastro NOVO: quem está logado, se fizer
// parte do time da unidade; senão fica vazio pra forçar a escolha (nunca chuta outra pessoa).
export function responsavelPadrao(opcoes: readonly string[], logado: string | null | undefined): string {
  return logado && opcoes.includes(logado) ? logado : "";
}

// Opções do <select> com o logado primeiro. O valor já gravado entra na lista mesmo que não
// seja do time da unidade (registro antigo, nome completo legado, troca de unidade) — sem
// isso a edição apagaria o responsável em silêncio.
export function opcoesResponsavel(opcoes: readonly string[], logado: string | null | undefined, atual?: string | null): string[] {
  const lista = [...opcoes];
  if (atual && !lista.includes(atual)) lista.push(atual);
  if (logado && lista.includes(logado)) return [logado, ...lista.filter((n) => n !== logado)];
  return lista;
}
