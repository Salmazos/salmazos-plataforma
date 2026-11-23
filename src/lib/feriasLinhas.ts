// Férias (aviso de vencimento): a LINHA da lista e tudo o que a tela decide a partir dela — sem banco e sem dependência de servidor, então a tela
// (componente cliente), a lista da API e a exportação CSV usam as MESMAS regras (feriasRegras.ts continua sendo a única fonte das regras de data).
import {
  SEMAFORO_INFO, type EstadoFerias, type OrigemPeriodo, type SemaforoFerias, type SituacaoFerias,
} from "@/lib/feriasRegras";

export interface LinhaFerias {
  funcionario_id: string;
  nome_completo: string;
  cliente_id: string | null;
  cliente_nome: string;
  unidade_id: string;
  unidade_nome: string;
  tipo_servico: string | null;
  efetivado_em: string | null;
  data_admissao: string | null;
  data_base: string | null;
  data_base_ajustada: boolean;
  estado: EstadoFerias;
  estado_rotulo: string;
  semaforo: SemaforoFerias;
  dias_restantes: number | null;
  saldo_confirmado: boolean;
  // Saldo não gravado mas dispensado: ainda não há período terminado (menos de 12 meses de casa), vale "nenhum" calculado na hora.
  saldo_calculado: boolean;
  programacao_vencida: boolean;
  periodo: {
    id: string;
    numero: number;
    aquisitivo_inicio: string;
    aquisitivo_fim: string;
    data_limite: string;
    situacao: SituacaoFerias;
    gozo_inicio: string | null;
    gozo_fim: string | null;
    observacao: string | null;
    origem: OrigemPeriodo;
  } | null;
  // Último período lançado pelo RH (programada, em gozo ou gozada, origem "gerado"): é o que a rota de situação aceita reabrir. Pode ser o período
  // anterior ao atual (gozada que "passou ao próximo").
  reabrivel: { id: string; numero: number; situacao: SituacaoFerias; gozo_inicio: string | null; gozo_fim: string | null } | null;
}

// Faixas do resumo do topo (cada linha cai em UMA só, então os números somam): vencidos (prazo passou), até 30 dias, de 31 a 90 dias, saldo pendente.
export const FAIXAS_FERIAS = ["vencidos", "ate30", "ate90", "pendente"] as const;
export type FaixaFerias = (typeof FAIXAS_FERIAS)[number];

export const ROTULO_FAIXA_FERIAS: Record<FaixaFerias, string> = {
  vencidos: "Vencidos",
  ate30: "Até 30 dias",
  ate90: "De 31 a 90 dias",
  pendente: "Saldo inicial pendente",
};

export interface FiltrosFerias {
  // Um funcionário só (o link dos avisos de férias abre a aba já filtrada por ele).
  funcionario_id?: string;
  cliente_id?: string;
  unidade_id?: string;
  situacao?: SituacaoFerias;
  semaforo?: SemaforoFerias;
  faixa?: FaixaFerias;
  a_vencer?: boolean;
  busca?: string;
}

export function linhaNaFaixa(l: Pick<LinhaFerias, "estado" | "dias_restantes">, faixa: FaixaFerias): boolean {
  if (faixa === "pendente") return l.estado === "saldo_pendente";
  if (l.estado !== "ok" || l.dias_restantes === null) return false;
  if (faixa === "vencidos") return l.dias_restantes < 0;
  if (faixa === "ate30") return l.dias_restantes >= 0 && l.dias_restantes <= 30;
  return l.dias_restantes >= 31 && l.dias_restantes <= 90;
}

export function contarFaixas(linhas: Pick<LinhaFerias, "estado" | "dias_restantes">[]): Record<FaixaFerias, number> {
  const total: Record<FaixaFerias, number> = { vencidos: 0, ate30: 0, ate90: 0, pendente: 0 };
  for (const l of linhas) for (const f of FAIXAS_FERIAS) if (linhaNaFaixa(l, f)) total[f]++;
  return total;
}

const MARCAS = new RegExp("[\\u0300-\\u036f]", "g");
const normalizar = (t: string) => t.normalize("NFD").replace(MARCAS, "").toLowerCase();

// Todos os filtros combinam com AND. Mesma função na tela, na lista da API e na exportação: o CSV é exatamente o que a tela mostra.
export function filtrarLinhasFerias<T extends LinhaFerias>(linhas: T[], f: FiltrosFerias): T[] {
  const busca = f.busca ? normalizar(f.busca) : "";
  return linhas.filter((l) => {
    if (f.funcionario_id && l.funcionario_id !== f.funcionario_id) return false;
    if (f.cliente_id && l.cliente_id !== f.cliente_id) return false;
    if (f.unidade_id && l.unidade_id !== f.unidade_id) return false;
    if (f.situacao && l.periodo?.situacao !== f.situacao) return false;
    if (f.semaforo && l.semaforo !== f.semaforo) return false;
    if (f.faixa && !linhaNaFaixa(l, f.faixa)) return false;
    if (f.a_vencer && l.semaforo !== "amarelo" && l.semaforo !== "vermelho") return false;
    if (busca && !normalizar(l.nome_completo).includes(busca)) return false;
    return true;
  });
}

// ── Selo do prazo ───────────────────────────────────────────────────────────
// Verde "No prazo", amarelo "Atenção" (90 dias ou menos), vermelho "Urgente" (30 ou menos) ou "Vencido"; cinza com o motivo escrito.
export function seloDoPrazo(l: Pick<LinhaFerias, "estado" | "estado_rotulo" | "semaforo" | "dias_restantes">): { bg: string; text: string; rotulo: string } {
  const info = SEMAFORO_INFO[l.semaforo];
  if (l.estado !== "ok") return { bg: info.bg, text: info.text, rotulo: l.estado_rotulo };
  if (l.semaforo === "vermelho" && l.dias_restantes !== null && l.dias_restantes < 0) return { bg: info.bg, text: info.text, rotulo: "Vencido" };
  return { bg: info.bg, text: info.text, rotulo: info.rotulo };
}

// ── O que cada linha permite fazer (espelha as regras das rotas /api/ferias/[funcionarioId]/*) ──
export interface AcaoLinha {
  habilitada: boolean;
  // Por que está desabilitada (texto para o usuário); vazio quando habilitada.
  motivo: string;
}

export interface AcoesDaLinha {
  programar: AcaoLinha;
  emGozo: AcaoLinha;
  gozada: AcaoLinha;
  reabrir: AcaoLinha;
  ajustarDataBase: AcaoLinha;
  informarSaldo: AcaoLinha;
  // "Informar saldo inicial" em destaque: a linha está cinza esperando o saldo.
  saldoEmDestaque: boolean;
  // "Ajustar data-base" em destaque: sem data-base, ou a data-base mudou e precisa ser reconfirmada.
  dataBaseEmDestaque: boolean;
}

const OK: AcaoLinha = { habilitada: true, motivo: "" };
const negar = (motivo: string): AcaoLinha => ({ habilitada: false, motivo });

export function acoesDaLinha(l: LinhaFerias, hojeISO: string): AcoesDaLinha {
  const p = l.periodo;
  const bloqueio = ((): string | null => {
    switch (l.estado) {
      case "sem_data_base": return "Informe a data-base deste funcionário primeiro.";
      case "ainda_nao_iniciou": return "A data-base deste funcionário ainda não chegou.";
      case "base_alterada": return "A data-base mudou depois de gerar os períodos. Reconfirme a data-base primeiro.";
      case "saldo_pendente": return "Informe o saldo inicial primeiro (fim do último período já quitado, ou \"nenhum\").";
      default: return p ? null : "Não há período em aberto.";
    }
  })();

  let programar = bloqueio ? negar(bloqueio) : OK;
  let emGozo = bloqueio ? negar(bloqueio) : OK;
  let gozada = bloqueio ? negar(bloqueio) : OK;

  if (!bloqueio && p) {
    if (p.situacao === "em_gozo") {
      programar = negar("Este período já está em gozo.");
      emGozo = negar("Este período já está em gozo.");
    }
    // As férias já programadas só podem virar "em gozo" quando começam, e "gozada" quando terminam (a rota recusa datas futuras).
    if (p.situacao === "programada" && p.gozo_inicio && p.gozo_inicio > hojeISO) {
      emGozo = negar(`As férias começam em ${formatarBR(p.gozo_inicio)}.`);
      gozada = negar(`As férias ainda não começaram (início em ${formatarBR(p.gozo_inicio)}).`);
    }
    if ((p.situacao === "programada" || p.situacao === "em_gozo") && p.gozo_fim && p.gozo_fim > hojeISO && gozada.habilitada) {
      gozada = negar(`As férias terminam em ${formatarBR(p.gozo_fim)}.`);
    }
  }

  const reabrir: AcaoLinha = l.reabrivel ? OK : negar("Nenhum período lançado para reabrir.");
  const semBase = l.estado === "sem_data_base" || l.estado === "ainda_nao_iniciou";

  return {
    programar, emGozo, gozada, reabrir,
    ajustarDataBase: OK,
    // O saldo exige data-base válida (a rota responde 409 nos dois casos).
    informarSaldo: l.estado === "base_alterada" ? negar("Reconfirme a data-base primeiro.") : semBase ? negar(l.estado === "sem_data_base" ? "Informe a data-base primeiro." : "A data-base ainda não chegou.") : OK,
    saldoEmDestaque: l.estado === "saldo_pendente",
    dataBaseEmDestaque: l.estado === "sem_data_base" || l.estado === "base_alterada",
  };
}

function formatarBR(dataISO: string): string {
  const [a, m, d] = dataISO.split("-");
  return `${d}/${m}/${a}`;
}

// ── Validações dos modais (espelham as rotas: a tela avisa antes, a rota continua sendo a trava de verdade) ──
export interface ResultadoValidacao {
  erro: string | null;
  // Só alerta, não impede.
  aviso: string | null;
}

type PeriodoParaValidar = { aquisitivo_fim: string; data_limite: string };

// Programar: início de hoje em diante, depois do fim do período aquisitivo; início E fim até a data-limite; fim não antes do início.
export function validarProgramacao(p: PeriodoParaValidar, inicio: string, fim: string, hojeISO: string): ResultadoValidacao {
  if (!inicio || !fim) return { erro: "Informe as datas inicial e final.", aviso: null };
  if (fim < inicio) return { erro: "A data final não pode ser anterior à data inicial.", aviso: null };
  if (inicio < hojeISO) return { erro: "A data inicial não pode ser anterior a hoje.", aviso: null };
  if (inicio <= p.aquisitivo_fim) return { erro: `As férias só podem começar depois do fim do período aquisitivo (${formatarBR(p.aquisitivo_fim)}).`, aviso: null };
  if (inicio > p.data_limite) {
    return { erro: `A data inicial passa da data-limite (${formatarBR(p.data_limite)}). Para registrar férias já em andamento ou concluídas, use "Em gozo" ou "Gozada".`, aviso: null };
  }
  // O fim também é bloqueado (a rota faz o mesmo): dias gozados depois do período concessivo são pagos em dobro (Súmula 81 do TST).
  if (fim > p.data_limite) return { erro: `O fim das férias não pode passar da data-limite (${formatarBR(p.data_limite)}), senão há pagamento em dobro.`, aviso: null };
  return { erro: null, aviso: null };
}

// Em gozo / Gozada: datas do gozo. Em gozo: já começou. Gozada: já começou e já terminou.
export function validarGozo(p: PeriodoParaValidar, acao: "em_gozo" | "gozada", inicio: string, fim: string, hojeISO: string): ResultadoValidacao {
  if (!inicio || !fim) return { erro: "Informe as datas inicial e final do gozo.", aviso: null };
  if (fim < inicio) return { erro: "A data final não pode ser anterior à data inicial.", aviso: null };
  if (inicio <= p.aquisitivo_fim) return { erro: `As férias só podem começar depois do fim do período aquisitivo (${formatarBR(p.aquisitivo_fim)}).`, aviso: null };
  if (inicio > hojeISO) return { erro: "As férias ainda não começaram: a data inicial é futura. Use \"Programar\".", aviso: null };
  if (acao === "gozada" && fim > hojeISO) return { erro: "As férias ainda não terminaram: a data final é futura.", aviso: null };
  return { erro: null, aviso: null };
}
