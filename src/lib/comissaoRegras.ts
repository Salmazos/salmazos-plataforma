// Regras PURAS da comissão de analistas (Fase 1) — sem imports, para o script de verificação carregar direto e para a
// tela usar as mesmas contas do servidor. Regra de negócio decidida pelo Olver:
// - comissão = percentual do BENEFICIÁRIO sobre o fee_valor BRUTO da cobrança R&S (nunca fixo no código);
// - mês de competência = mês (America/Sao_Paulo) da data de ENVIO da cobrança para validação (cobrancas_rs.enviado_em);
// - entra como "prevista" quando a cobrança é enviada, vira "confirmada" quando a diretoria valida; cancelada se a
//   cobrança for cancelada. Cobrança de mês já passado marcada depois nasce "retroativo_pendente" até a diretoria aprovar.

export const FUSO_COMISSAO = "America/Sao_Paulo";

export type TipoLancamento = "comissao" | "ajuste" | "estorno";
export type StatusLancamento = "prevista" | "confirmada" | "retroativo_pendente" | "contestada" | "cancelada" | "recusada";
export type StatusCobranca = "pendente_revisao" | "aprovada_enviada" | "validada" | "paga" | "cancelada";
export type TipoCobranca = "contratacao" | "cancelamento";

// Status que ainda contam como comissão ativa (os que o índice único do banco considera).
export const STATUS_TERMINAIS: readonly StatusLancamento[] = ["cancelada", "recusada"];
export const ehTerminal = (s: string): boolean => STATUS_TERMINAIS.includes(s as StatusLancamento);

export function arredondar2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// 5% de 400,00 = 20,00. O percentual vem do beneficiário (ex.: 5), nunca de constante.
export function calcularComissao(feeValor: number, percentual: number): number {
  return arredondar2((feeValor * percentual) / 100);
}

// "AAAA-MM-01" do mês (em Brasília) de um instante ISO. Enviada às 23:30 do dia 31 em Brasília conta no mês do dia 31,
// mesmo que em UTC já seja o mês seguinte.
export function competenciaDoInstante(instanteISO: string): string {
  const dia = new Date(instanteISO).toLocaleDateString("en-CA", { timeZone: FUSO_COMISSAO }); // AAAA-MM-DD
  return `${dia.slice(0, 7)}-01`;
}

export function competenciaAtual(agora: Date = new Date()): string {
  return competenciaDoInstante(agora.toISOString());
}

// "2026-11" (campo type=month) -> "2026-11-01"; inválido -> null.
export function competenciaDoMes(mes: string | null | undefined): string | null {
  return mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? `${mes}-01` : null;
}

export const mesDaCompetencia = (competencia: string): string => competencia.slice(0, 7);

export function competenciaPassou(competencia: string, agora: Date = new Date()): boolean {
  return competencia < competenciaAtual(agora);
}

export function rotuloCompetencia(competencia: string): string {
  const [a, m] = competencia.split("-");
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[Number(m) - 1]}/${a}`;
}

// Status que a comissão "deveria ter" olhando só a cobrança. null = a cobrança ainda não pode ter comissão
// (rascunho em revisão). Cobrança de CANCELAMENTO (taxa de cancelamento): a comissão é sobre a taxa EFETIVAMENTE PAGA, então só
// confirma quando a cobrança é paga (validada ainda é "prevista").
export function statusPelaCobranca(cobranca: { status: string; tipo?: string | null }): "prevista" | "confirmada" | "cancelada" | null {
  switch (cobranca.status) {
    case "aprovada_enviada":
      return "prevista";
    case "validada":
      return cobranca.tipo === "cancelamento" ? "prevista" : "confirmada";
    case "paga":
      return "confirmada";
    case "cancelada":
      return "cancelada";
    default:
      return null;
  }
}

export type MotivoRecusaMarcacao =
  | "cobranca_sem_envio"
  | "cobranca_cancelada"
  | "cobranca_em_revisao"
  | "sem_valor"
  | "reposicao_garantia";

// A cobrança pode receber marcação de comissão? (os dados lidos pelo chamador; nada de I/O aqui)
export function motivoDeNaoPoderMarcar(c: {
  status: string;
  enviado_em: string | null;
  fee_valor: number | string | null;
  reposicao_garantia?: boolean;
}): MotivoRecusaMarcacao | null {
  if (c.reposicao_garantia) return "reposicao_garantia";
  if (c.status === "cancelada") return "cobranca_cancelada";
  if (c.status === "pendente_revisao") return "cobranca_em_revisao";
  if (!c.enviado_em) return "cobranca_sem_envio";
  if (!(Number(c.fee_valor) > 0)) return "sem_valor";
  return null;
}

export const MENSAGEM_RECUSA_MARCACAO: Record<MotivoRecusaMarcacao, string> = {
  cobranca_sem_envio: "Esta cobrança não tem data de envio para validação registrada — não dá definir o mês de competência.",
  cobranca_cancelada: "Cobrança cancelada não gera comissão.",
  cobranca_em_revisao: "A comissão só entra depois que a cobrança é enviada para validação da diretoria.",
  sem_valor: "A cobrança não tem fee (valor) para calcular a comissão.",
  reposicao_garantia: "Reposição por garantia não gera comissão.",
};

// Status inicial de uma marcação nova. Competência de mês passado -> retroativo_pendente (só conta depois da aprovação da
// diretoria), independente do status da cobrança.
export function statusInicialDaMarcacao(
  cobranca: { status: string; tipo?: string | null; enviado_em: string },
  agora: Date = new Date()
): { competencia: string; status: "prevista" | "confirmada" | "retroativo_pendente" } {
  const competencia = competenciaDoInstante(cobranca.enviado_em);
  if (competenciaPassou(competencia, agora)) return { competencia, status: "retroativo_pendente" };
  const s = statusPelaCobranca(cobranca);
  return { competencia, status: s === "confirmada" ? "confirmada" : "prevista" };
}

export interface LancamentoSync {
  tipo: string;
  status: string;
  base_valor: number | string | null;
  valor_comissao: number | string;
  percentual_aplicado: number | string | null;
  fechado_em?: string | null;
}

// O que mudar num lançamento de COMISSÃO para acompanhar a cobrança. Devolve só o que realmente muda ({} = nada).
// - terminal (cancelada/recusada) e ajuste/estorno: nunca mudam;
// - prevista/confirmada: status acompanha a cobrança (validada -> confirmada; voltou a aguardar -> prevista; cancelada);
// - contestada e retroativo_pendente: o status é decisão da diretoria e não muda sozinho; só a CANCELAMENTO da cobrança vale;
// - valor: acompanha fee_valor atual (correção de taxa) enquanto não houver fechamento, com o percentual JÁ aplicado.
export function mudancasPorCobranca(
  l: LancamentoSync,
  cobranca: { status: string; tipo?: string | null; fee_valor: number | string | null }
): { status?: StatusLancamento; base_valor?: number; valor_comissao?: number } {
  if (l.tipo !== "comissao" || ehTerminal(l.status)) return {};
  const mud: { status?: StatusLancamento; base_valor?: number; valor_comissao?: number } = {};
  const alvo = statusPelaCobranca(cobranca);

  if (alvo === "cancelada") mud.status = "cancelada";
  else if (alvo && (l.status === "prevista" || l.status === "confirmada") && alvo !== l.status) mud.status = alvo;

  if (!l.fechado_em && cobranca.fee_valor != null && l.percentual_aplicado != null && mud.status !== "cancelada") {
    const fee = arredondar2(Number(cobranca.fee_valor));
    const valor = calcularComissao(fee, Number(l.percentual_aplicado));
    if (fee !== arredondar2(Number(l.base_valor)) || valor !== arredondar2(Number(l.valor_comissao))) {
      mud.base_valor = fee;
      mud.valor_comissao = valor;
    }
  }
  return mud;
}

// O beneficiário só desmarca enquanto a cobrança NÃO foi validada (ainda aguardando validação), ou o pedido retroativo
// que ainda não foi decidido. Depois de validada, só a diretoria desfaz (por estorno).
export function beneficiarioPodeDesmarcar(l: { tipo: string; status: string }, cobranca: { status: string }): boolean {
  if (l.tipo !== "comissao") return false;
  if (l.status === "retroativo_pendente") return true;
  return l.status === "prevista" && cobranca.status === "aprovada_enviada";
}

export interface TotaisComissao {
  previsto: number;
  confirmado: number;
  contestado: number;
  retroativoPendente: number;
}

export interface LancamentoParaTotal {
  id?: string;
  tipo: string;
  status: string;
  valor_comissao: number | string;
  lancamento_origem_id?: string | null;
  // Status ATUAL do lançamento de comissão a que o ajuste/estorno se refere (o serviço preenche; se faltar, procura na própria lista).
  origem_status?: string | null;
}

// Somas assinadas. Um ajuste/estorno entra no MESMO grupo do lançamento original (pelo status atual dele): estornar uma comissão
// prevista reduz o "previsto", estornar uma confirmada reduz o "confirmado" — o líquido fica coerente (original + estorno = 0 no
// mesmo cartão) e, quando o original muda de status (prevista -> confirmada), o ajuste acompanha. Original cancelado/recusado
// (nada conta) leva o ajuste junto. Sem como achar o original, o ajuste cai em "confirmado".
export function totalizar(lancs: LancamentoParaTotal[]): TotaisComissao {
  const t: TotaisComissao = { previsto: 0, confirmado: 0, contestado: 0, retroativoPendente: 0 };
  const statusPorId = new Map(lancs.filter((l) => l.id).map((l) => [l.id as string, l.status]));
  for (const l of lancs) {
    const v = Number(l.valor_comissao) || 0;
    const status = l.tipo === "comissao" ? l.status : l.origem_status ?? (l.lancamento_origem_id ? statusPorId.get(l.lancamento_origem_id) : undefined) ?? "confirmada";
    if (l.tipo !== "comissao" && l.status !== "confirmada") continue;
    if (status === "prevista") t.previsto += v;
    else if (status === "confirmada") t.confirmado += v;
    else if (status === "contestada") t.contestado += v;
    else if (status === "retroativo_pendente") t.retroativoPendente += v;
  }
  return {
    previsto: arredondar2(t.previsto),
    confirmado: arredondar2(t.confirmado),
    contestado: arredondar2(t.contestado),
    retroativoPendente: arredondar2(t.retroativoPendente),
  };
}

export const ROTULO_STATUS: Record<StatusLancamento, string> = {
  prevista: "Prevista",
  confirmada: "Confirmada",
  retroativo_pendente: "Retroativo pendente",
  contestada: "Contestada",
  cancelada: "Cancelada",
  recusada: "Recusada",
};
