// Dias de teste estruturados (admissao_dias_teste, jsonb). Regras PURAS, sem imports de servidor: rodam igual na
// rota, na tela e em scripts/verificar-dia-teste.mts. Semântica da coluna: ver supabase/migration_dias_teste.sql.
import { z } from "zod";

export const MAX_DIAS_TESTE = 2;

export interface DiaTeste {
  data: string; // AAAA-MM-DD
  entrada: string; // HH:MM
  saida: string; // HH:MM
}

const REGEX_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const REGEX_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

function dataValida(texto: string): boolean {
  const m = REGEX_DATA.exec(texto);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export const diaTesteSchema = z
  .object({
    data: z.string().refine(dataValida, "Informe uma data de teste válida."),
    entrada: z.string().regex(REGEX_HORA, "Informe a hora de entrada no formato HH:MM."),
    saida: z.string().regex(REGEX_HORA, "Informe a hora de saída no formato HH:MM."),
  })
  // Saída MENOR que a entrada é permitido (turno que vira a meia-noite); só igual não tem duração.
  .refine((d) => d.entrada !== d.saida, { message: "A saída precisa ser diferente da entrada.", path: ["saida"] });

export const diasTesteSchema = z
  .array(diaTesteSchema)
  .max(MAX_DIAS_TESTE, `Informe no máximo ${MAX_DIAS_TESTE} dias de teste.`)
  .refine((lista) => new Set(lista.map((d) => d.data)).size === lista.length, "Não repita a mesma data de teste.");

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function minutosDoDia(dia: DiaTeste): number {
  const diff = minutos(dia.saida) - minutos(dia.entrada);
  return diff > 0 ? diff : diff + 24 * 60; // saída < entrada: vira a meia-noite
}

function textoHoras(totalMinutos: number): string {
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export function horasDoDiaTeste(dia: DiaTeste): string {
  return textoHoras(minutosDoDia(dia));
}

export function totalHorasDiasTeste(lista: DiaTeste[]): string {
  return textoHoras(lista.reduce((soma, d) => soma + minutosDoDia(d), 0));
}

// null/undefined = não informado → null (quem chama decide se omite a linha). [] → "Não houve". Data formatada por
// split da string, nunca new Date (evita o deslocamento de um dia por fuso).
export function formatarDiasTeste(valor: unknown): string | null {
  if (valor === null || valor === undefined || !Array.isArray(valor)) return null;
  if (valor.length === 0) return "Não houve";
  return (valor as DiaTeste[])
    .map((d) => `${d.data.split("-").reverse().join("/")} · ${d.entrada} às ${d.saida} (${horasDoDiaTeste(d)})`)
    .join("\n");
}

// MOT e Terceirização: o cliente precisa responder (inclusive "não houve" = []). R&S não tem dia de teste.
export function exigeRespostaDiasTeste(tipoServico: string | null | undefined): boolean {
  return tipoServico === "mao_obra_temporaria" || tipoServico === "terceirizacao";
}

export const MSG_INFORME_DIAS_TESTE = "Informe se houve dia(s) de teste.";

// Regra única das rotas do portal: R&S ignora o campo (valor null, nada a gravar); nos demais, ausente/null é erro.
export function resolverDiasTeste(
  tipoServico: string | null | undefined,
  valor: DiaTeste[] | null | undefined
): { ok: true; valor: DiaTeste[] | null } | { ok: false; erro: string } {
  if (!exigeRespostaDiasTeste(tipoServico)) return { ok: true, valor: null };
  if (valor === undefined || valor === null) return { ok: false, erro: MSG_INFORME_DIAS_TESTE };
  return { ok: true, valor };
}

// ── Exibição para o RH/DP (lançar na folha). SOMENTE leitura: nada aqui marca "lançado" nem calcula valor. ──

export interface DiasTesteRH {
  // Uma linha por dia ("05/11/2026 · 08:00 às 12:00 (4h)"), ou a frase única dos demais casos.
  linhas: string[];
  // "Total: 12h" — só quando há dias.
  total: string | null;
  // true só com dias a lançar: é o que ganha o bloco âmbar "a pagar na folha".
  destacar: boolean;
}

// Regra única de exibição (telas do RH, perfil do candidato, admissão, funcionário):
//   lista       -> uma linha por dia + total;
//   []          -> "Não houve dia de teste";
//   null + texto antigo (admissao_dia_teste) -> o texto antigo, como foi digitado;
//   null sem texto -> "Não informado pelo cliente", mas só em MOT/Terceirização; em R&S não há o que mostrar (null).
export function textoDiasTesteParaRH(
  dias: unknown,
  textoLegado: string | null | undefined,
  tipoServico: string | null | undefined
): DiasTesteRH | null {
  if (Array.isArray(dias)) {
    if (dias.length === 0) return { linhas: ["Não houve dia de teste"], total: null, destacar: false };
    return {
      linhas: (formatarDiasTeste(dias) as string).split("\n"),
      total: `Total: ${totalHorasDiasTeste(dias as DiaTeste[])}`,
      destacar: true,
    };
  }
  const legado = textoLegado?.trim();
  if (legado) return { linhas: [legado], total: null, destacar: false };
  if (exigeRespostaDiasTeste(tipoServico)) return { linhas: ["Não informado pelo cliente"], total: null, destacar: false };
  return null;
}

// Selo da listagem de admissões: só quando há dias ("2 dia(s) · 12h"); [] e null não ganham selo.
export function seloDiasTeste(dias: unknown): string | null {
  if (!Array.isArray(dias) || dias.length === 0) return null;
  return `${dias.length} dia(s) · ${totalHorasDiasTeste(dias as DiaTeste[])}`;
}
