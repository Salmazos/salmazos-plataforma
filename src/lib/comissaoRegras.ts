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

// Status inicial de uma marcação nova: o da cobrança (prevista/confirmada). A marcação do beneficiário NUNCA nasce retroativo_pendente:
// o que está fora do prazo é recusado (409) em decidirCompetencia, não vira pedido para a diretoria.
export function statusInicialDaMarcacao(cobranca: { status: string; tipo?: string | null }): "prevista" | "confirmada" {
  return statusPelaCobranca(cobranca) === "confirmada" ? "confirmada" : "prevista";
}

// ── Prazo de lançamento ("folga" até o dia 3 do mês seguinte) ────────────────────────────────────────────────────────
// DECISÃO DO NEGÓCIO: a cobrança enviada na sexta 17:30 do último dia do mês só é vista na segunda; por isso o beneficiário pode
// lançar a comissão do mês M até o dia 3 do mês M+1 (23:59:59 de Brasília; o dia 4 às 00:00 já bloqueia). Tudo em America/Sao_Paulo.

export const DIA_LIMITE_LANCAMENTO = 3;
export const MENSAGEM_PRAZO_ENCERRADO = "Prazo para lançar esta comissão encerrado (até o dia 3 do mês seguinte). Fale com a diretoria.";
export const MENSAGEM_ESCOLHA_INVALIDA = "Só cobranças enviadas nos dias 1 a 3 podem ser lançadas no mês anterior.";

export type EscolhaCompetencia = "atual" | "anterior";

// Dia do mês (1–31) de um instante, em Brasília.
export function diaDoInstante(instante: Date | string): number {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return Number(d.toLocaleDateString("en-CA", { timeZone: FUSO_COMISSAO }).slice(8, 10));
}

// Soma/subtrai meses de uma competência "AAAA-MM-01" (vira o ano: 2027-01 − 1 = 2026-12).
export function deslocarCompetencia(competencia: string, meses: number): string {
  const [a, m] = competencia.split("-").map(Number);
  const idx = a * 12 + (m - 1) + meses;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}
export const mesAnteriorDe = (competencia: string): string => deslocarCompetencia(competencia, -1);
export const mesSeguinteDe = (competencia: string): string => deslocarCompetencia(competencia, 1);

// Estamos dentro do prazo de lançamento do mês anterior? (dia 1 a 3, Brasília)
export const dentroDaFolga = (agora: Date = new Date()): boolean => diaDoInstante(agora) <= DIA_LIMITE_LANCAMENTO;

// Competência em que a marcação vale, a partir do envio da cobrança, de "agora" e da escolha explícita do beneficiário.
// 1) enviada no mês corrente: vale o corrente; EXCEÇÃO hoje<=3 E envio<=3: o beneficiário pode escolher "anterior" (vaga fechada no mês anterior);
// 2) enviada no mês anterior: só até o dia 3, com competência = mês do envio (a escolha não muda nada aqui);
// 3) qualquer outro caso: 409 mes_encerrado. Escolha "anterior" fora da janela = 409; para cobrança enviada depois do dia 3 = 422.
export type DecisaoCompetencia =
  | { ok: true; competencia: string; folga: boolean; escolha: EscolhaCompetencia }
  | { ok: false; status: 409 | 422; codigo: "mes_encerrado" | "competencia_invalida"; error: string };

export function decidirCompetencia(o: { enviadoEm: string; agora?: Date; escolha?: EscolhaCompetencia | null }): DecisaoCompetencia {
  const agora = o.agora ?? new Date();
  const mesH = competenciaAtual(agora);
  const mesE = competenciaDoInstante(o.enviadoEm);
  const encerrado: DecisaoCompetencia = { ok: false, status: 409, codigo: "mes_encerrado", error: MENSAGEM_PRAZO_ENCERRADO };

  if (mesE === mesH) {
    if (o.escolha !== "anterior") return { ok: true, competencia: mesH, folga: false, escolha: "atual" };
    if (!dentroDaFolga(agora)) return encerrado;
    if (diaDoInstante(o.enviadoEm) > DIA_LIMITE_LANCAMENTO) return { ok: false, status: 422, codigo: "competencia_invalida", error: MENSAGEM_ESCOLHA_INVALIDA };
    return { ok: true, competencia: mesAnteriorDe(mesH), folga: true, escolha: "anterior" };
  }
  if (mesE === mesAnteriorDe(mesH) && dentroDaFolga(agora)) return { ok: true, competencia: mesE, folga: true, escolha: "atual" };
  return encerrado;
}

// A cobrança aparece em "Cobranças para marcar" (com a competência padrão) e, se sim, o beneficiário pode escolher a competência?
export function situacaoParaMarcar(o: { enviadoEm: string; agora?: Date }): { competencia: string; folga: boolean; escolhaCompetencia: boolean } | null {
  const agora = o.agora ?? new Date();
  const d = decidirCompetencia({ enviadoEm: o.enviadoEm, agora });
  if (!d.ok) return null;
  const escolhaCompetencia = decidirCompetencia({ enviadoEm: o.enviadoEm, agora, escolha: "anterior" }).ok && d.competencia === competenciaAtual(agora);
  return { competencia: d.competencia, folga: d.folga, escolhaCompetencia };
}

// "Lançada na folga": marcada no mês SEGUINTE ao da competência, até o dia 3 (derivado de marcado_em; sem coluna). Ajuste/estorno nunca
// (a competência deles é a do registro). Retroativos antigos marcados fora dos dias 1–3 também não contam.
export function lancadaNaFolga(l: { tipo: string; competencia: string; marcado_em: string | null | undefined }): boolean {
  if (l.tipo !== "comissao" || !l.marcado_em) return false;
  return competenciaDoInstante(l.marcado_em) === mesSeguinteDe(l.competencia) && diaDoInstante(l.marcado_em) <= DIA_LIMITE_LANCAMENTO;
}

// Fechamento do mês M só a partir do dia 4 do mês seguinte (depois do prazo de lançamento). Devolve o 1º dia liberado ("AAAA-MM-04").
export const fechamentoLiberadoEm = (competencia: string): string => `${mesSeguinteDe(competencia).slice(0, 8)}0${DIA_LIMITE_LANCAMENTO + 1}`;
export function prazoDeLancamentoAberto(competencia: string, agora: Date = new Date()): boolean {
  const hoje = agora.toLocaleDateString("en-CA", { timeZone: FUSO_COMISSAO });
  return hoje < fechamentoLiberadoEm(competencia);
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
  // Fechado = congelado (Fase 2): nem status nem valor acompanham a cobrança; correção posterior entra como ajuste/estorno.
  if (l.tipo !== "comissao" || ehTerminal(l.status) || l.fechado_em) return {};
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
  // Confirmado e AINDA NÃO fechado (entra no próximo fechamento).
  confirmado: number;
  contestado: number;
  retroativoPendente: number;
  // Fechado e ainda não pago na folha.
  aReceber: number;
  // Fechado e pago.
  pago: number;
}

export interface LancamentoParaTotal {
  id?: string;
  tipo: string;
  status: string;
  valor_comissao: number | string;
  lancamento_origem_id?: string | null;
  // Status ATUAL do lançamento de comissão a que o ajuste/estorno se refere (o serviço preenche; se faltar, procura na própria lista).
  origem_status?: string | null;
  // O original já foi fechado? (o serviço preenche)
  origem_fechado?: boolean | null;
  // Fechamento do PRÓPRIO lançamento: fechado_em preenchido = fechado; fechamento_pago diz se a folha já foi paga.
  fechado_em?: string | null;
  fechamento_pago?: boolean | null;
}

// Somas assinadas. Cada valor aparece em UM cartão só:
// - fechado: "a receber" (fechamento ainda sem pagamento) ou "pago";
// - não fechado: pelo status (previsto / confirmado / contestado / retroativo pendente);
// - ajuste/estorno NÃO fechado entra no cartão do original: estornar uma comissão prevista reduz o "previsto"; estornar uma já
//   fechada reduz o próximo pagamento ("confirmado", que é o que vai no próximo fechamento) — o líquido de cada cartão fica
//   coerente e, quando o original muda de status, o ajuste acompanha. Original cancelado/recusado (nada conta) leva o ajuste junto.
//   Sem como achar o original, o ajuste cai em "confirmado".
export function totalizar(lancs: LancamentoParaTotal[]): TotaisComissao {
  const t: TotaisComissao = { previsto: 0, confirmado: 0, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 0 };
  const statusPorId = new Map(lancs.filter((l) => l.id).map((l) => [l.id as string, l.status]));
  for (const l of lancs) {
    const v = Number(l.valor_comissao) || 0;
    if (l.tipo !== "comissao" && l.status !== "confirmada") continue;
    if (l.fechado_em) {
      if (l.fechamento_pago) t.pago += v;
      else t.aReceber += v;
      continue;
    }
    const status = l.tipo === "comissao" ? l.status : l.origem_fechado ? "confirmada" : l.origem_status ?? (l.lancamento_origem_id ? statusPorId.get(l.lancamento_origem_id) : undefined) ?? "confirmada";
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
    aReceber: arredondar2(t.aReceber),
    pago: arredondar2(t.pago),
  };
}

// ── Fechamento mensal (Fase 2) ─────────────────────────────────────────────────────────────────────────────────────────

export interface LancamentoParaFechar {
  id: string;
  tipo: string;
  status: string;
  competencia: string;
  fechamento_id: string | null;
  lancamento_origem_id: string | null;
  valor_comissao: number | string;
}

// Seleção do fechamento do mês `competencia` (1º dia) para UMA unidade — mesma regra da função SQL comissao_fechar_mes (que é a
// autoridade; esta serve à prévia da tela e aos testes):
// - bloqueiam: comissão retroativo_pendente ou contestada com competência <= mês;
// - entram: comissão CONFIRMADA sem fechamento com competência <= mês (a confirmada depois do fechamento do mês dela entra no
//   fechamento seguinte, com a competência original preservada), mais ajustes/estornos sem fechamento com competência <= mês cujo
//   original já foi fechado ou entra agora; prevista, contestada, retroativo, cancelada e recusada ficam fora.
export function selecionarParaFechamento(
  lancs: LancamentoParaFechar[],
  competencia: string,
  origensJaFechadas: ReadonlySet<string>
): { comissoes: string[]; ajustes: string[]; bloqueios: string[]; total: number } {
  const bloqueios = lancs.filter((l) => l.tipo === "comissao" && (l.status === "retroativo_pendente" || l.status === "contestada") && l.competencia <= competencia).map((l) => l.id);
  const comissoes = lancs.filter((l) => l.tipo === "comissao" && l.status === "confirmada" && !l.fechamento_id && l.competencia <= competencia);
  const idsComissoes = new Set(comissoes.map((l) => l.id));
  const ajustes = lancs.filter(
    (l) => l.tipo !== "comissao" && !l.fechamento_id && l.competencia <= competencia && !!l.lancamento_origem_id && (origensJaFechadas.has(l.lancamento_origem_id) || idsComissoes.has(l.lancamento_origem_id))
  );
  const total = arredondar2([...comissoes, ...ajustes].reduce((s, l) => s + Number(l.valor_comissao), 0));
  return { comissoes: comissoes.map((l) => l.id), ajustes: ajustes.map((l) => l.id), bloqueios, total };
}

// Lançamento que entra num fechamento de mês POSTERIOR ao da competência dele ("atrasada de <mês de origem>").
export function mesAtrasadoDe(competenciaLancamento: string, competenciaFechamento: string): string | null {
  return competenciaLancamento < competenciaFechamento ? competenciaLancamento : null;
}

// ── CSV para a folha ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface LinhaFolha {
  beneficiario: string;
  tipo: string; // Comissão | Ajuste | Estorno
  cliente: string;
  vaga: string;
  competencia: string; // AAAA-MM-01
  atrasadaDe: string | null; // AAAA-MM-01 | null
  fee: number | null;
  comissao: number; // assinado
  motivo: string | null;
}

const num2 = (n: number): string => n.toFixed(2).replace(".", ",");

function celulaCsv(v: string): string {
  // Neutraliza fórmula de planilha (=, +, -, @) em texto livre e escapa ; " e quebras de linha.
  const seguro = /^[=+\-@]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

// Cabeçalho + uma linha por LinhaFolha (as mesmas linhas da tela) + uma linha TOTAL por beneficiário. Separador ";" e decimal com
// vírgula (Excel pt-BR); BOM no início para o Excel reconhecer UTF-8. Valores assinados: estorno é negativo.
export const CABECALHO_CSV = ["Beneficiário", "Tipo", "Cliente", "Vaga", "Competência", "Atrasada de", "Fee (R$)", "Comissão (R$)", "Motivo"] as const;

export function montarCsvFolha(linhas: LinhaFolha[]): string {
  const mes = (c: string | null): string => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : "");
  const corpo = linhas.map((l) =>
    [l.beneficiario, l.tipo, l.cliente, l.vaga, mes(l.competencia), mes(l.atrasadaDe), l.fee == null ? "" : num2(l.fee), num2(l.comissao), l.motivo ?? ""].map(celulaCsv).join(";")
  );
  const totais = new Map<string, number>();
  for (const l of linhas) totais.set(l.beneficiario, (totais.get(l.beneficiario) ?? 0) + l.comissao);
  const linhasTotal = [...totais.entries()].map(([nome, t]) => [nome, "TOTAL", "", "", "", "", "", num2(arredondar2(t)), ""].map(celulaCsv).join(";"));
  return "\uFEFF" + [CABECALHO_CSV.join(";"), ...corpo, ...linhasTotal].join("\r\n") + "\r\n";
}

export const ROTULO_STATUS: Record<StatusLancamento, string> = {
  prevista: "Prevista",
  confirmada: "Confirmada",
  retroativo_pendente: "Retroativo pendente",
  contestada: "Contestada",
  cancelada: "Cancelada",
  recusada: "Recusada",
};
