// Jornada de trabalho com COMPENSAÇÃO DE HORAS: texto padrão gerado a partir de horas digitadas (nada fixo) e interpretação do mesmo texto de volta.
// Módulo único e puro (sem imports de servidor nem de tela): todas as telas de escala/horário que ganharam estas opções usam o gerador daqui, e os
// validadores aceitam exatamente estes textos. Só o texto PADRÃO é reconhecido na volta; qualquer outro texto (todas as grafias antigas) não é
// interpretado e cai em "Personalizado"/texto livre, como sempre foi.
//
// Textos gerados (grafia "sexta-feira", "sábado"; horas no formato 08h00):
//   seg_sex                "Segunda a sexta-feira, das 08h00 às 17h00"
//   seg_qui_sex_reduzida   "Segunda a quinta-feira, das 08h00 às 17h00; sexta-feira, até as 16h00"
//   seg_sex_sab_reduzido   "Segunda a sexta-feira, das 08h00 às 17h00; sábado, das 08h00 às 12h00"
// Intervalo, quando a tela tem o campo: sufixo entre parênteses com a FRASE do intervalo (ex.: " (intervalo de 1h)", " (sem intervalo)"), o mesmo
// formato da Solicitar Vaga.

export type ModeloJornada = "seg_sex" | "seg_qui_sex_reduzida" | "seg_sex_sab_reduzido";

// Rótulos nas listas/chips das telas (valor gravado em admissao_escala nas indicações).
export const ROTULO_JORNADA: Record<ModeloJornada, string> = {
  seg_sex: "Segunda a sexta-feira",
  seg_qui_sex_reduzida: "Segunda a quinta-feira + sexta reduzida",
  seg_sex_sab_reduzido: "Segunda a sexta-feira + sábado reduzido",
};
export const MODELOS_JORNADA: readonly ModeloJornada[] = ["seg_sex", "seg_qui_sex_reduzida", "seg_sex_sab_reduzido"];
// As duas opções COM compensação (a "Segunda a sexta" simples já existe em várias telas e não é duplicada nelas).
export const MODELOS_COMPENSACAO: readonly ModeloJornada[] = ["seg_qui_sex_reduzida", "seg_sex_sab_reduzido"];

export const modeloDoRotulo = (rotulo: string | null | undefined): ModeloJornada | null =>
  MODELOS_JORNADA.find((m) => ROTULO_JORNADA[m] === rotulo) ?? null;

export interface HorasJornada {
  entrada: string;
  saida: string;
  // só seg_qui_sex_reduzida: hora de saída na sexta ("até as 16h00")
  sextaSaida?: string;
  // só seg_sex_sab_reduzido: horário do sábado
  sabadoEntrada?: string;
  sabadoSaida?: string;
  // frase do intervalo (ex.: "intervalo de 1h", "intervalo de 12h00 às 13h00", "sem intervalo"); vazio = sem sufixo
  intervalo?: string;
}

export const HORAS_JORNADA_VAZIAS: HorasJornada = { entrada: "", saida: "", sextaSaida: "", sabadoEntrada: "", sabadoSaida: "", intervalo: "" };

const HORA = /^([01]?\d|2[0-3])[:h]([0-5]\d)$/;
// "08:00" (input time), "08h00" ou "8h00" -> "08h00"; qualquer outra coisa -> "" (campo incompleto/inválido).
export function normalizarHora(valor: string | null | undefined): string {
  const m = HORA.exec((valor ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}h${m[2]}` : "";
}
// "08h00" -> "08:00" (valor de <input type="time">)
export const horaParaInput = (texto: string): string => {
  const n = normalizarHora(texto);
  return n ? n.replace("h", ":") : "";
};

const sufixoIntervalo = (h: HorasJornada) => (h.intervalo?.trim() ? ` (${h.intervalo.trim()})` : "");

// Texto padrão. "" enquanto faltar alguma hora do modelo (a tela trata como horário não preenchido).
export function gerarTextoJornada(modelo: ModeloJornada, h: HorasJornada): string {
  const e = normalizarHora(h.entrada), s = normalizarHora(h.saida);
  if (!e || !s) return "";
  if (modelo === "seg_sex") return `Segunda a sexta-feira, das ${e} às ${s}${sufixoIntervalo(h)}`;
  if (modelo === "seg_qui_sex_reduzida") {
    const sx = normalizarHora(h.sextaSaida);
    return sx ? `Segunda a quinta-feira, das ${e} às ${s}; sexta-feira, até as ${sx}${sufixoIntervalo(h)}` : "";
  }
  const se = normalizarHora(h.sabadoEntrada), ss = normalizarHora(h.sabadoSaida);
  return se && ss ? `Segunda a sexta-feira, das ${e} às ${s}; sábado, das ${se} às ${ss}${sufixoIntervalo(h)}` : "";
}

const H = "([01]\\d|2[0-3])h([0-5]\\d)";
// o sufixo é a FRASE do intervalo entre parênteses ("intervalo de 1h", "sem intervalo")
const INTERVALO = "(?: \\(((?:intervalo de |sem intervalo)[^()]*)\\))?";
const RE_SEG_SEX = new RegExp(`^Segunda a sexta-feira, das ${H} às ${H}${INTERVALO}$`);
const RE_SEG_QUI = new RegExp(`^Segunda a quinta-feira, das ${H} às ${H}; sexta-feira, até as ${H}${INTERVALO}$`);
const RE_SAB = new RegExp(`^Segunda a sexta-feira, das ${H} às ${H}; sábado, das ${H} às ${H}${INTERVALO}$`);
const hh = (a: string, b: string) => `${a}h${b}`;

// Só reconhece o texto padrão gerado acima (grafia exata). Texto antigo, em qualquer outra grafia, devolve null.
export function interpretarTextoJornada(texto: string | null | undefined): ({ modelo: ModeloJornada } & HorasJornada) | null {
  const t = (texto ?? "").trim();
  let m = RE_SEG_SEX.exec(t);
  if (m) return { modelo: "seg_sex", entrada: hh(m[1], m[2]), saida: hh(m[3], m[4]), intervalo: m[5] ?? "" };
  m = RE_SEG_QUI.exec(t);
  if (m) return { modelo: "seg_qui_sex_reduzida", entrada: hh(m[1], m[2]), saida: hh(m[3], m[4]), sextaSaida: hh(m[5], m[6]), intervalo: m[7] ?? "" };
  m = RE_SAB.exec(t);
  if (m) return { modelo: "seg_sex_sab_reduzido", entrada: hh(m[1], m[2]), saida: hh(m[3], m[4]), sabadoEntrada: hh(m[5], m[6]), sabadoSaida: hh(m[7], m[8]), intervalo: m[9] ?? "" };
  return null;
}

export const ehTextoJornadaPadrao = (texto: string | null | undefined): boolean => interpretarTextoJornada(texto) !== null;
