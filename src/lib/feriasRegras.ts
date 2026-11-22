// Férias (aviso de vencimento): regras PURAS, sem banco. A contabilidade terceirizada faz os cálculos e os lançamentos de férias
// (valores, faltas, dias de direito, fracionamento); a plataforma só calcula o período aquisitivo, a data-limite para tirar as
// férias e o semáforo, para avisar o RH a tempo. Datas são sempre "AAAA-MM-DD" (datas puras, sem hora nem fuso).
// Schema e decisões: supabase/migration_ferias_aviso.sql.

export const SITUACOES_FERIAS = ["a_programar", "programada", "em_gozo", "gozada"] as const;
export type SituacaoFerias = (typeof SITUACOES_FERIAS)[number];
export type OrigemPeriodo = "gerado" | "saldo_inicial";
export type SemaforoFerias = "verde" | "amarelo" | "vermelho" | "cinza";

export const ROTULO_SITUACAO_FERIAS: Record<SituacaoFerias, string> = {
  a_programar: "A programar",
  programada: "Programada com a contabilidade",
  em_gozo: "Em gozo",
  gozada: "Gozada",
};

// Marcos dos avisos (dias que faltam para a data-limite) e faixas do semáforo.
export const MARCOS_AVISO = [90, 60, 30] as const;
export type MarcoAviso = (typeof MARCOS_AVISO)[number];
export const DIAS_AMARELO = 90; // 90 dias ou menos: amarelo
export const DIAS_VERMELHO = 30; // 30 dias ou menos, ou vencido: vermelho

// ── Datas ───────────────────────────────────────────────────────────────────
function partes(dataISO: string): [number, number, number] {
  const [a, m, d] = dataISO.split("-").map(Number);
  return [a, m, d];
}

function paraISO(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function adicionarDiasISO(dataISO: string, dias: number): string {
  const [a, m, d] = partes(dataISO);
  const data = new Date(Date.UTC(a, m - 1, d));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Dias corridos de `deISO` até `ateISO` (negativo se `ate` é anterior).
export function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = partes(deISO);
  const [a2, m2, d2] = partes(ateISO);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

// Soma meses no calendário: se o dia não existe no mês de chegada, vira o último dia daquele mês (31/08 + 6 meses = 28/02).
export function somarMesesISO(dataISO: string, meses: number): string {
  const [a, m, d] = partes(dataISO);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return paraISO(ano, mes, Math.min(d, ultimoDiaDoMes(ano, mes)));
}

// n-ésimo aniversário da data-base (n = 0 é a própria data). Sempre calculado a partir da data-base, nunca encadeado.
// 29/02: em ano não bissexto o aniversário cai em 28/02 (decisão do Olver); em ano bissexto volta a 29/02.
export function aniversarioISO(dataBaseISO: string, n: number): string {
  const [a, m, d] = partes(dataBaseISO);
  const ano = a + n;
  return paraISO(ano, m, Math.min(d, ultimoDiaDoMes(ano, m)));
}

// ── Períodos ────────────────────────────────────────────────────────────────
export interface PeriodoCalculado {
  numero: number;
  aquisitivo_inicio: string;
  aquisitivo_fim: string;
  data_limite: string;
}

// Período n (1, 2, 3...): começa no (n-1)º aniversário da data-base e termina na véspera do n-ésimo aniversário (sem lacuna e sem
// sobreposição entre períodos). A data-limite para tirar as férias é o fim do aquisitivo + 12 meses (depois disso, pagamento em dobro).
export function calcularPeriodo(dataBaseISO: string, numero: number): PeriodoCalculado {
  const aquisitivo_inicio = aniversarioISO(dataBaseISO, numero - 1);
  const aquisitivo_fim = adicionarDiasISO(aniversarioISO(dataBaseISO, numero), -1);
  return { numero, aquisitivo_inicio, aquisitivo_fim, data_limite: somarMesesISO(aquisitivo_fim, 12) };
}

// Trava de segurança contra data-base absurda (ex.: ano 1900 por erro de digitação gerando dezenas de períodos).
export const MAX_PERIODOS = 60;

// Todos os períodos já iniciados até `hojeISO` (inclusive o que ainda está em aquisição). Data-base no futuro: nenhum.
export function periodosIniciadosAte(dataBaseISO: string, hojeISO: string): PeriodoCalculado[] {
  if (dataBaseISO > hojeISO) return [];
  const lista: PeriodoCalculado[] = [];
  for (let n = 1; n <= MAX_PERIODOS; n++) {
    const p = calcularPeriodo(dataBaseISO, n);
    if (p.aquisitivo_inicio > hojeISO) break;
    lista.push(p);
  }
  return lista;
}

// Períodos que ainda não existem no banco (idempotência de garantirPeriodos).
export function periodosFaltantes(dataBaseISO: string, hojeISO: string, existentes: { numero: number }[]): PeriodoCalculado[] {
  const tem = new Set(existentes.map((e) => e.numero));
  return periodosIniciadosAte(dataBaseISO, hojeISO).filter((p) => !tem.has(p.numero));
}

// A data-base mudou (ex.: data_admissao editada depois de gerar os períodos): algum período guardado não bate com o que a data-base atual gera.
export function periodosDivergentes(dataBaseISO: string, existentes: Pick<PeriodoCalculado, "numero" | "aquisitivo_inicio" | "aquisitivo_fim" | "data_limite">[]): boolean {
  return existentes.some((e) => {
    const esperado = calcularPeriodo(dataBaseISO, e.numero);
    return esperado.aquisitivo_inicio !== e.aquisitivo_inicio || esperado.aquisitivo_fim !== e.aquisitivo_fim || esperado.data_limite !== e.data_limite;
  });
}

// ── Quem entra e qual é a data-base ─────────────────────────────────────────
// Entra: ativo E (terceirização OU efetivado). MOT sem efetivação fica fora. A data de efetivação não entra em nenhuma conta.
export function ehElegivelFerias(f: { status: string | null; tipo_servico: string | null; efetivado_em?: string | null }): boolean {
  if (f.status !== "ativo") return false;
  return f.tipo_servico === "terceirizacao" || !!f.efetivado_em;
}

// data-base = coalesce(data_base_ajustada, data_admissao).
export function resolverDataBase(dataAdmissao: string | null | undefined, dataBaseAjustada: string | null | undefined): string | null {
  return dataBaseAjustada || dataAdmissao || null;
}

// ── Semáforo ────────────────────────────────────────────────────────────────
export function diasRestantes(dataLimiteISO: string, hojeISO: string): number {
  return diasEntre(hojeISO, dataLimiteISO);
}

// Verde acima de 90 dias; amarelo com 90 ou menos; vermelho com 30 ou menos ou vencido (dias negativos).
export function calcularSemaforo(dias: number): Exclude<SemaforoFerias, "cinza"> {
  if (dias <= DIAS_VERMELHO) return "vermelho";
  if (dias <= DIAS_AMARELO) return "amarelo";
  return "verde";
}

export const SEMAFORO_INFO: Record<SemaforoFerias, { bg: string; text: string; rotulo: string }> = {
  verde: { bg: "#D1FAE5", text: "#166534", rotulo: "No prazo" },
  amarelo: { bg: "#FEF3C7", text: "#92400E", rotulo: "Atenção" },
  vermelho: { bg: "#FEE2E2", text: "#991B1B", rotulo: "Urgente" },
  cinza: { bg: "#F3F4F6", text: "#4B5563", rotulo: "—" },
};

export type EstadoFerias =
  | "ok"
  | "sem_data_base" // sem data de admissão e sem data-base ajustada: "informar data-base"
  | "ainda_nao_iniciou" // data-base no futuro: sem período
  | "base_alterada" // períodos guardados não batem com a data-base atual: o RH reconfirma a data-base
  | "saldo_pendente"; // contabilidade ainda não informou o saldo inicial: cinza, sem vencido e sem aviso

export const ROTULO_ESTADO_FERIAS: Record<EstadoFerias, string> = {
  ok: "",
  sem_data_base: "Informar data-base",
  ainda_nao_iniciou: "Ainda não iniciou",
  base_alterada: "Data-base mudou: reconfirmar",
  saldo_pendente: "Saldo inicial pendente",
};

export interface PeriodoFerias extends PeriodoCalculado {
  id: string;
  situacao: SituacaoFerias;
  gozo_inicio: string | null;
  gozo_fim: string | null;
  observacao: string | null;
  origem: OrigemPeriodo;
  aviso_90_em: string | null;
  aviso_60_em: string | null;
  aviso_30_em: string | null;
}

// Programada cuja data de início já passou sem a situação virar em_gozo ou gozada: os avisos voltam (decisão do Olver).
export function programacaoVencida(p: Pick<PeriodoFerias, "situacao" | "gozo_inicio">, hojeISO: string): boolean {
  return p.situacao === "programada" && !!p.gozo_inicio && p.gozo_inicio < hojeISO;
}

// O período entra nos avisos de 90/60/30? Só enquanto "a programar", ou "programada" com a data de início já vencida.
// Em gozo e gozada nunca avisam.
export function periodoPedeAviso(p: Pick<PeriodoFerias, "situacao" | "gozo_inicio">, hojeISO: string): boolean {
  if (p.situacao === "a_programar") return true;
  return programacaoVencida(p, hojeISO);
}

// Período em foco do funcionário: o mais antigo ainda não gozado. "Gozada" fecha o período e o funcionário passa ao próximo.
export function periodoAtual<T extends { numero: number; situacao: SituacaoFerias }>(periodos: T[]): T | null {
  return [...periodos].sort((a, b) => a.numero - b.numero).find((p) => p.situacao !== "gozada") ?? null;
}

// Marco de aviso a disparar agora (cron da 2D): o mais urgente já alcançado cujo registro de envio está vazio. Se o cron roda pela primeira vez
// com o prazo já em 20 dias, só o marco de 30 sai (os de 90 e 60 ficam em `marcarComoVistos`, para não saírem três avisos de uma vez).
// `saldoConfirmado` aqui significa "saldo resolvido" (use saldoResolvido: confirmado OU nenhum período terminado). Falso (saldo inicial pendente) nunca avisa.
export function avisoPendente(
  p: Pick<PeriodoFerias, "situacao" | "gozo_inicio" | "data_limite" | "aviso_90_em" | "aviso_60_em" | "aviso_30_em">,
  hojeISO: string,
  saldoConfirmado: boolean
): { marco: MarcoAviso; marcarComoVistos: MarcoAviso[] } | null {
  if (!saldoConfirmado || !periodoPedeAviso(p, hojeISO)) return null;
  const dias = diasRestantes(p.data_limite, hojeISO);
  const alcancados = MARCOS_AVISO.filter((m) => dias <= m); // [90, 60, 30] em ordem: o último é o mais urgente
  if (alcancados.length === 0) return null;
  const marco = alcancados[alcancados.length - 1];
  const enviado = { 90: p.aviso_90_em, 60: p.aviso_60_em, 30: p.aviso_30_em } as const;
  if (enviado[marco]) return null;
  return { marco, marcarComoVistos: alcancados.filter((m) => m !== marco && !enviado[m]) };
}

// ── Estado do funcionário na lista ──────────────────────────────────────────
export interface AvaliacaoFerias {
  estado: EstadoFerias;
  semaforo: SemaforoFerias;
  periodo: PeriodoFerias | null;
  diasRestantes: number | null;
  programacaoVencida: boolean;
  // true = o saldo inicial NÃO foi gravado, mas não é preciso: ainda não há nenhum período aquisitivo terminado (menos de 12 meses de casa),
  // então vale "nenhum", calculado na hora.
  saldoCalculado: boolean;
}

// Só precisa de saldo inicial quem JÁ TEM pelo menos um período aquisitivo terminado (fim anterior a hoje). Quem ainda está no primeiro período
// não tem o que quitar: o saldo é "nenhum" calculado na hora, sem gravar nada (decisão do Olver). Período que termina hoje ainda não terminou.
export function precisaSaldoInicial(dataBaseISO: string, hojeISO: string): boolean {
  return calcularPeriodo(dataBaseISO, 1).aquisitivo_fim < hojeISO;
}

// O saldo está resolvido (pode avisar e lançar férias) quando foi confirmado OU quando não é preciso (nenhum período terminado).
export function saldoResolvido(dataBaseISO: string, saldoConfirmado: boolean, hojeISO: string): boolean {
  return saldoConfirmado || !precisaSaldoInicial(dataBaseISO, hojeISO);
}

export function avaliarFerias(entrada: { dataBase: string | null; saldoConfirmado: boolean; periodos: PeriodoFerias[]; hojeISO: string }): AvaliacaoFerias {
  const { dataBase, saldoConfirmado, periodos, hojeISO } = entrada;
  const vazio = (estado: EstadoFerias, periodo: PeriodoFerias | null = null): AvaliacaoFerias => ({
    estado, semaforo: "cinza", periodo, diasRestantes: null, programacaoVencida: false, saldoCalculado: false,
  });

  if (!dataBase) return vazio("sem_data_base");
  if (dataBase > hojeISO) return vazio("ainda_nao_iniciou");
  if (periodosDivergentes(dataBase, periodos)) return vazio("base_alterada");

  const atual = periodoAtual(periodos);
  // Saldo pendente = já existe período terminado e a contabilidade ainda não informou o saldo. Sem período terminado, vale "nenhum" calculado na hora.
  const saldoCalculado = !saldoConfirmado && !precisaSaldoInicial(dataBase, hojeISO);
  if (!saldoConfirmado && !saldoCalculado) return vazio("saldo_pendente", atual);
  if (!atual) return { estado: "ok", semaforo: "verde", periodo: null, diasRestantes: null, programacaoVencida: false, saldoCalculado };

  const dias = diasRestantes(atual.data_limite, hojeISO);
  return { estado: "ok", semaforo: calcularSemaforo(dias), periodo: atual, diasRestantes: dias, programacaoVencida: programacaoVencida(atual, hojeISO), saldoCalculado };
}

// ── Saldo inicial ───────────────────────────────────────────────────────────
// A contabilidade informa o FIM do último período aquisitivo já quitado (ou "nenhum"). Períodos que terminam até essa data viram "gozada" com origem
// 'saldo_inicial'. Se a data não bate com o fim de nenhum período, o sistema sugere o mais próximo (empate: o mais antigo) e o RH confirma.
export type ResultadoSaldoInicial =
  | { tipo: "nenhum" }
  | { tipo: "exato"; numero: number; aquisitivo_fim: string }
  | { tipo: "aproximado"; sugestao: { numero: number; aquisitivo_fim: string }; informado: string }
  | { tipo: "invalido"; motivo: string };

export function resolverSaldoInicial(dataBaseISO: string, quitadoAteISO: string | null, hojeISO: string): ResultadoSaldoInicial {
  if (quitadoAteISO === null) return { tipo: "nenhum" };
  if (quitadoAteISO > hojeISO) return { tipo: "invalido", motivo: "A data do último período quitado não pode ser futura." };
  if (quitadoAteISO < dataBaseISO) return { tipo: "invalido", motivo: "A data do último período quitado é anterior à data-base." };
  // Só períodos cujo aquisitivo já terminou podem estar quitados.
  const concluidos = periodosIniciadosAte(dataBaseISO, hojeISO).filter((p) => p.aquisitivo_fim < hojeISO);
  if (concluidos.length === 0) return { tipo: "invalido", motivo: "Ainda não há período aquisitivo concluído para quitar." };
  const exato = concluidos.find((p) => p.aquisitivo_fim === quitadoAteISO);
  if (exato) return { tipo: "exato", numero: exato.numero, aquisitivo_fim: exato.aquisitivo_fim };
  let melhor = concluidos[0];
  for (const p of concluidos) {
    if (Math.abs(diasEntre(p.aquisitivo_fim, quitadoAteISO)) < Math.abs(diasEntre(melhor.aquisitivo_fim, quitadoAteISO))) melhor = p;
  }
  return { tipo: "aproximado", sugestao: { numero: melhor.numero, aquisitivo_fim: melhor.aquisitivo_fim }, informado: quitadoAteISO };
}

// ── Texto ───────────────────────────────────────────────────────────────────
export function textoDiasRestantes(dias: number | null): string {
  if (dias === null) return "—";
  if (dias < 0) return `Vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return "Vence hoje";
  return `${dias} dia(s)`;
}
