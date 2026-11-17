import { TEMPO_CONTRATO_PADRAO } from "@/lib/constants";
import { DIAS_AUXILIAR_PRORROGACAO, MAX_DIAS_CONTRATO } from "@/lib/dataTerminoContrato";
import { MODELOS_JORNADA, ROTULO_JORNADA, interpretarTextoJornada, modeloDoRotulo } from "@/lib/jornadaTrabalho";

// Padrão ÚNICO dos dados de admissão que o cliente informa na indicação / aprovação de candidato (admissao_* em candidatos_vagas e
// solicitacoes_indicacao_candidato). As listas abaixo existiam duplicadas em PortalAvaliacaoBtn.tsx e portal/indicar-candidato/page.tsx e foram
// MOVIDAS para cá sem mudar nenhum valor; as telas importam daqui. As mesmas regras valem na tela (quem edita) e no servidor (schemas.ts), para
// que texto livre não entre nem por requisição direta. Salário já é número (CampoMoeda); horário, escala, turno, centro de custo e tempo de
// contrato eram texto livre.

export const PERIODOS_EXP = ["30 dias", "45 dias", "90 dias"];

// Terceirização continua com o select único combinado.
export const TURNO_OPCOES = [
  "Turno A", "Turno B", "Turno C", "Turno D",
  "Horário Administrativo", "Escala 6x1", "Escala 6x2", "Escala Fixa", "Outro",
];

// MOT — Turno e Escala são dois campos independentes (admissao_turno + admissao_escala).
export const TURNO_OPCOES_MOT = ["Turno A", "Turno B", "Turno C", "Turno D", "Horário Administrativo", "Outro"];
// Escalas com jornada em texto padrão (jornadaTrabalho.ts): o horário dessas escalas é o texto gerado ("Segunda a quinta-feira, das 08h00 às 17h00;
// sexta-feira, até as 16h00"), SEM prefixo de turno; o turno continua um campo à parte. Ficam depois de "Fixa" e antes de "Outro".
export const ESCALAS_JORNADA = MODELOS_JORNADA.map((m) => ROTULO_JORNADA[m]);
export const ESCALA_OPCOES_MOT = ["6x1", "6x2", "12x36 - Dia", "12x36 - Noite", "Fixa", ...ESCALAS_JORNADA, "Outro"];

// "Outro" na tela vira o texto digitado no banco. DECISÃO DO OLVER: esse texto só vale em formato reconhecido ("Turno X" / "NxM[ - Dia|Noite]").
export const OPCAO_OUTRO = "Outro";
const REGEX_TURNO_OUTRO = /^Turno [A-Z]$/;
const REGEX_ESCALA_OUTRO = /^\d{1,2}x\d{1,2}( - (Dia|Noite))?$/;
const REGEX_HORARIO = /^(.+), ([01]\d|2[0-3])h([0-5]\d) às ([01]\d|2[0-3])h([0-5]\d)$/;
const REGEX_CENTRO_CUSTO = /^[A-Za-z0-9._/-]{1,30}$/;
const REGEX_TEMPO = /^(\d{1,3}) dias(?:, prorrogável por mais (\d{1,3}) dias)?$/;

export const CENTRO_CUSTO_MAX = 30;
export const SALARIO_MENSAL_MIN = 1;
export const SALARIO_MENSAL_MAX = 100000;
export const SALARIO_HORA_MIN = 1;
export const SALARIO_HORA_MAX = 1000;

const fixos = (l: string[]) => l.filter((t) => t !== OPCAO_OUTRO);
export const TURNOS_VALIDOS: readonly string[] = [...new Set([...fixos(TURNO_OPCOES), ...fixos(TURNO_OPCOES_MOT)])];
export const ESCALAS_VALIDAS: readonly string[] = fixos(ESCALA_OPCOES_MOT);

// "06:00" (input type=time) -> "06h00"
export function formatarHoraTexto(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${h}h${m}`;
}
const paraInputHora = (h: string, m: string) => `${h}:${m}`;

export function comporHorario(turno: string, entrada: string, saida: string): string {
  return `${turno}, ${formatarHoraTexto(entrada)} às ${formatarHoraTexto(saida)}`;
}

// "Turno B, 08h00 às 17h00" -> { turno, entrada: "08:00", saida: "17:00" }; null se não estiver no formato.
export function decomporHorario(texto: string | null | undefined): { turno: string; entrada: string; saida: string } | null {
  const m = REGEX_HORARIO.exec((texto ?? "").trim());
  return m ? { turno: m[1], entrada: paraInputHora(m[2], m[3]), saida: paraInputHora(m[4], m[5]) } : null;
}

export const turnoValido = (v: string) => TURNOS_VALIDOS.includes(v) || REGEX_TURNO_OUTRO.test(v);
export const escalaValida = (v: string) => ESCALAS_VALIDAS.includes(v) || REGEX_ESCALA_OUTRO.test(v);

// ── Mensagens claras: dizem o que está errado e qual é o formato certo ──
export function erroTurno(v: string): string | null {
  return turnoValido(v) ? null : `Turno inválido: escolha uma das opções (${TURNOS_VALIDOS.join(", ")}) ou, em "Outro", use o formato "Turno X" (ex.: Turno E).`;
}
export function erroEscala(v: string): string | null {
  return escalaValida(v) ? null : `Escala inválida: escolha uma das opções (${ESCALAS_VALIDAS.join(", ")}) ou, em "Outro", use o formato NxM (ex.: 5x2) ou NxM - Dia/Noite.`;
}
export function erroHorario(v: string): string | null {
  // Texto padrão de jornada (jornadaTrabalho.ts) vale sem prefixo de turno.
  if (interpretarTextoJornada(v)) return null;
  const d = decomporHorario(v);
  if (!d) return 'Horário inválido: use o formato "Turno B, 08h00 às 17h00" (turno, hora de entrada e hora de saída) ou um dos modelos "Segunda a sexta-feira, das 08h00 às 17h00", "Segunda a quinta-feira, das 08h00 às 17h00; sexta-feira, até as 16h00" ou "Segunda a sexta-feira, das 08h00 às 17h00; sábado, das 08h00 às 12h00".';
  return turnoValido(d.turno) ? null : `Horário inválido: o turno "${d.turno}" não é uma das opções. ${erroTurno(d.turno)}`;
}
export function erroCentroCusto(v: string): string | null {
  return REGEX_CENTRO_CUSTO.test(v) ? null : `Centro de custo inválido: use até ${CENTRO_CUSTO_MAX} caracteres, sem espaços, só letras, números e . _ / - (ex.: CC-0042).`;
}
export function erroTempoContrato(v: string): string | null {
  if (v === TEMPO_CONTRATO_PADRAO) return null;
  const m = REGEX_TEMPO.exec(v);
  const formato = `Tempo de contrato inválido: use "${TEMPO_CONTRATO_PADRAO}" ou "N dias" / "N dias, prorrogável por mais M dias" (N de 1 a ${MAX_DIAS_CONTRATO}, M de 1 a ${DIAS_AUXILIAR_PRORROGACAO}).`;
  if (!m) return formato;
  const dias = Number(m[1]);
  const prorrogacao = m[2] === undefined ? null : Number(m[2]);
  if (dias < 1 || dias > MAX_DIAS_CONTRATO) return formato;
  if (prorrogacao !== null && (prorrogacao < 1 || prorrogacao > DIAS_AUXILIAR_PRORROGACAO)) return formato;
  return null;
}

const temNoMaximoDuasCasas = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7;
const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function erroSalario(n: number, min: number, max: number, rotulo: string): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return `${rotulo} inválido: informe um valor em reais (ex.: ${brl(min * 2000)}).`;
  if (!temNoMaximoDuasCasas(n)) return `${rotulo} inválido: use no máximo 2 casas decimais (centavos).`;
  if (n < min || n > max) return `${rotulo} fora da faixa permitida: de R$ ${brl(min)} a R$ ${brl(max)}.`;
  return null;
}
export const erroSalarioMensal = (n: number) => erroSalario(n, SALARIO_MENSAL_MIN, SALARIO_MENSAL_MAX, "Salário mensal");
export const erroSalarioHora = (n: number) => erroSalario(n, SALARIO_HORA_MIN, SALARIO_HORA_MAX, "Salário por hora");

export interface CamposAdmissaoPadrao {
  admissao_salario?: number | null;
  admissao_salario_hora?: number | null;
  admissao_centro_custo?: string | null;
  admissao_horario?: string | null;
  admissao_turno?: string | null;
  admissao_escala?: string | null;
  admissao_tempo_contrato?: string | null;
}

export interface ErroCampoAdmissao {
  campo: keyof CamposAdmissaoPadrao;
  rotulo: string;
  erro: string;
}

const ROTULO_JORNADA_EXEMPLO = {
  seg_sex: "Segunda a sexta-feira, das 08h00 às 17h00",
  seg_qui_sex_reduzida: "Segunda a quinta-feira, das 08h00 às 17h00; sexta-feira, até as 16h00",
  seg_sex_sab_reduzido: "Segunda a sexta-feira, das 08h00 às 17h00; sábado, das 08h00 às 12h00",
} as const;

// Escala de jornada x horário: sem horário não há o que conferir (a exigência de preenchimento é de quem usa); com horário, ele precisa ser o texto
// padrão DA MESMA escala. Escalas comuns (6x1, 6x2, Fixa...) não entram: valem como sempre.
export function erroEscalaHorario(escala: string | null | undefined, horario: string | null | undefined): string | null {
  const modelo = modeloDoRotulo(escala);
  if (!modelo || !horario) return null;
  const j = interpretarTextoJornada(horario);
  if (j && j.modelo === modelo) return null;
  return `Horário e escala não conferem: a escala "${escala}" exige o horário no texto padrão dela (ex.: ${ROTULO_JORNADA_EXEMPLO[modelo]}).`;
}

const VALIDADORES: { campo: keyof CamposAdmissaoPadrao; rotulo: string; validar: (v: never) => string | null; tipo: "texto" | "numero" }[] = [
  { campo: "admissao_salario", rotulo: "Salário mensal", validar: erroSalarioMensal as (v: never) => string | null, tipo: "numero" },
  { campo: "admissao_salario_hora", rotulo: "Salário por hora", validar: erroSalarioHora as (v: never) => string | null, tipo: "numero" },
  { campo: "admissao_centro_custo", rotulo: "Centro de custo", validar: erroCentroCusto as (v: never) => string | null, tipo: "texto" },
  { campo: "admissao_horario", rotulo: "Horário", validar: erroHorario as (v: never) => string | null, tipo: "texto" },
  { campo: "admissao_turno", rotulo: "Turno", validar: erroTurno as (v: never) => string | null, tipo: "texto" },
  { campo: "admissao_escala", rotulo: "Escala", validar: erroEscala as (v: never) => string | null, tipo: "texto" },
  { campo: "admissao_tempo_contrato", rotulo: "Tempo de contrato", validar: erroTempoContrato as (v: never) => string | null, tipo: "texto" },
];

// Valida SÓ os campos presentes (não nulos): campo ausente/nulo é "não informado", e quem exige preenchimento é a regra de negócio de cada tela.
// Inclui a coerência horário x turno (o horário é composto a partir do turno: "<turno>, HHhMM às HHhMM").
export function validarCamposAdmissao(c: CamposAdmissaoPadrao): ErroCampoAdmissao[] {
  const erros: ErroCampoAdmissao[] = [];
  for (const v of VALIDADORES) {
    const valor = c[v.campo];
    if (valor === null || valor === undefined || valor === "") continue;
    const e = (v.validar as (x: unknown) => string | null)(valor);
    if (e) erros.push({ campo: v.campo, rotulo: v.rotulo, erro: e });
  }
  // Escala de jornada (Segunda a sexta-feira, + sexta reduzida, + sábado reduzido): o horário precisa ser o texto padrão DESSA escala.
  const erroJornada = erroEscalaHorario(c.admissao_escala, c.admissao_horario);
  if (erroJornada) erros.push({ campo: "admissao_horario", rotulo: "Horário", erro: erroJornada });
  // A coerência horário x turno vale SÓ para o formato antigo ("Turno X, HHhMM às HHhMM"); o texto padrão de jornada não leva turno.
  if (c.admissao_turno && c.admissao_horario) {
    const d = decomporHorario(c.admissao_horario);
    if (d && d.turno !== c.admissao_turno) {
      erros.push({ campo: "admissao_horario", rotulo: "Horário", erro: `Horário e turno não conferem: o horário começa com "${d.turno}" mas o turno é "${c.admissao_turno}".` });
    }
  }
  return erros;
}

export const mensagemErrosAdmissao = (erros: ErroCampoAdmissao[]): string => erros.map((e) => e.erro).join(" ");
