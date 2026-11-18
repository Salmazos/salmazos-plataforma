// Data para o usuário final, sempre dd/mm/aaaa. Três entradas, três tratamentos:
//  - "AAAA-MM-DD" (coluna `date` do banco): reformatada por TEXTO, sem Date, por formatarDataSemFuso (new Date() leria meia-noite UTC e, em
//    Brasília, mostraria o dia anterior). "AAAA-MM-DDTHH:MM:SS" sem fuso também é tratado como data pura (a parte da data, literal).
//  - Timestamp com fuso ("...Z" ou "...+00:00", como o Supabase devolve timestamptz) e Date: o instante é convertido para America/Sao_Paulo,
//    então o resultado não depende do fuso da máquina (navegador ou servidor).
//  - Vazio/nulo devolve "—" (mesmo padrão das telas); valor que não é data devolve o texto original, sem quebrar.
import { formatarDataSemFuso } from "@/lib/utils";

const FUSO = "America/Sao_Paulo";
const DATA_PURA = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEM_FUSO = /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const COM_FUSO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/i;

const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// "2026-11-19 01:30:00+00" (Postgres) não é lido pelo Date: vira "2026-11-19T01:30:00+00:00".
function paraIso(t: string): string {
  return t.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

function diaExiste(a: string, m: string, d: string): boolean {
  const ano = Number(a), mes = Number(m), dia = Number(d);
  const t = new Date(Date.UTC(ano, mes - 1, dia));
  return t.getUTCFullYear() === ano && t.getUTCMonth() === mes - 1 && t.getUTCDate() === dia;
}

function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function dataBR(valor: string | Date | null | undefined): string {
  if (vazio(valor)) return "—";
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? "—" : fmtData.format(valor);
  const t = String(valor).trim();
  const pura = DATA_PURA.exec(t) ?? SEM_FUSO.exec(t);
  if (pura) return diaExiste(pura[1], pura[2], pura[3]) ? formatarDataSemFuso(`${pura[1]}-${pura[2]}-${pura[3]}`) : String(valor);
  if (COM_FUSO.test(t)) {
    const d = new Date(paraIso(t));
    return Number.isNaN(d.getTime()) ? String(valor) : fmtData.format(d);
  }
  return String(valor);
}

// dd/mm/aaaa hh:mm (hora de Brasília) para timestamp com fuso; data pura sai só com a data.
export function dataHoraBR(valor: string | Date | null | undefined): string {
  if (vazio(valor)) return "—";
  const d = valor instanceof Date ? valor : COM_FUSO.test(String(valor).trim()) ? new Date(paraIso(String(valor).trim())) : null;
  if (d) return Number.isNaN(d.getTime()) ? String(valor) : fmtDataHora.format(d).replace(",", "");
  return dataBR(valor);
}

// Só para EXIBIR um JSON (por exemplo, os detalhes de um log de auditoria): devolve uma CÓPIA em que todo texto que é "AAAA-MM-DD" ou timestamp
// com fuso vira dd/mm/aaaa (com hora, quando é timestamp). Chaves, números, ids e qualquer outro texto ficam como estão, e o objeto original
// não é alterado.
export function formatarDatasParaExibicao(valor: unknown): unknown {
  if (typeof valor === "string") {
    const t = valor.trim();
    if (DATA_PURA.test(t)) return dataBR(t);
    if (COM_FUSO.test(t)) return dataHoraBR(t);
    return valor;
  }
  if (Array.isArray(valor)) return valor.map(formatarDatasParaExibicao);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, formatarDatasParaExibicao(v)]));
  return valor;
}
