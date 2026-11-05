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
