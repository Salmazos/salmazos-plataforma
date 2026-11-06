// Dias de teste: o cliente só informa SE houve e QUANTOS dias (admissao_qtd_dias_teste, smallint). Regras PURAS, sem imports
// de servidor: rodam igual na rota, na tela e em scripts/verificar-dia-teste.mts. Semântica da coluna (NULL / 0 / 1 / 2):
// ver supabase/migration_dias_teste_qtd.sql.
import { z } from "zod";

export const MAX_DIAS_TESTE = 2;

export const qtdDiasTesteSchema = z
  .number()
  .int("Informe a quantidade de dias de teste.")
  .min(0, "Informe a quantidade de dias de teste.")
  .max(MAX_DIAS_TESTE, `Informe no máximo ${MAX_DIAS_TESTE} dias de teste.`);

// Quantidade válida vinda do banco (smallint, CHECK 0..2) ou de qualquer lugar não confiável; qualquer outra coisa é "não informado".
function qtdValida(qtd: unknown): number | null {
  return typeof qtd === "number" && Number.isInteger(qtd) && qtd >= 0 && qtd <= MAX_DIAS_TESTE ? qtd : null;
}

// null/undefined = não informado → null (quem chama decide se omite a linha). 0 é uma resposta ("não houve"), não ausência.
export function formatarDiasTeste(qtd: unknown): string | null {
  const n = qtdValida(qtd);
  if (n === null) return null;
  if (n === 0) return "Não houve dia de teste";
  return n === 1 ? "1 dia de teste" : `${n} dias de teste`;
}

// MOT e Terceirização: o cliente precisa responder (inclusive "não houve" = 0). R&S não tem dia de teste.
export function exigeRespostaDiasTeste(tipoServico: string | null | undefined): boolean {
  return tipoServico === "mao_obra_temporaria" || tipoServico === "terceirizacao";
}

export const MSG_INFORME_DIAS_TESTE = "Informe se houve dia(s) de teste.";

// Regra única das rotas do portal: R&S ignora o campo (valor null, nada a gravar); nos demais, ausente/null é erro.
export function resolverDiasTeste(
  tipoServico: string | null | undefined,
  valor: number | null | undefined
): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (!exigeRespostaDiasTeste(tipoServico)) return { ok: true, valor: null };
  if (valor === undefined || valor === null) return { ok: false, erro: MSG_INFORME_DIAS_TESTE };
  return { ok: true, valor };
}

// ── Exibição para o RH/DP (lançar na folha). SOMENTE leitura: nada aqui marca "lançado" nem calcula valor. ──

export interface DiasTesteRH {
  linhas: string[];
  // true só com dias a lançar: é o que ganha o bloco âmbar "a pagar na folha".
  destacar: boolean;
}

// Regra única de exibição (telas do RH, perfil do candidato, admissão, funcionário):
//   1 ou 2      -> "1 dia de teste" / "2 dias de teste" (destacado);
//   0           -> "Não houve dia de teste";
//   null + texto antigo (admissao_dia_teste) -> o texto antigo, como foi digitado;
//   null sem texto -> "Não informado pelo cliente", mas só em MOT/Terceirização; em R&S não há o que mostrar (null).
export function textoDiasTesteParaRH(
  qtd: unknown,
  textoLegado: string | null | undefined,
  tipoServico: string | null | undefined
): DiasTesteRH | null {
  const n = qtdValida(qtd);
  if (n !== null) return { linhas: [formatarDiasTeste(n) as string], destacar: n > 0 };
  const legado = textoLegado?.trim();
  if (legado) return { linhas: [legado], destacar: false };
  if (exigeRespostaDiasTeste(tipoServico)) return { linhas: ["Não informado pelo cliente"], destacar: false };
  return null;
}

// Selo da listagem de admissões: só quando houve teste ("2 dia(s)"); 0 e null não ganham selo.
export function seloDiasTeste(qtd: unknown): string | null {
  const n = qtdValida(qtd);
  return n !== null && n > 0 ? `${n} dia(s)` : null;
}
