// Filtros e totais da tela Faturamento Unidades (FaturamentoHortolandiaPageClient.tsx),
// extraídos como funções puras para poder ser verificados sem renderizar a tela (ver
// scripts/verificar-faturamento-filtros.mts).
//
// REGRA DE ABERTURA (do Olver, prioridade máxima): ao abrir a tela e ao trocar de unidade NENHUM
// filtro fica ativo — a tabela não é filtrada por mês/período e os cards mostram o mês corrente,
// exatamente como antes dos filtros existirem. O mês corrente vale só para os CARDS enquanto o
// usuário não escolher um mês ou um período; depois da escolha explícita, ela filtra tabela e
// cards. Os filtros vivem só em estado de React: nada em URL, localStorage ou cookie.

export interface EntradaFiltravel {
  clienteId: string;
  clienteNome: string;
  numeroNf: string | null;
  observacoes: string | null;
  valor: number;
  dataVencimento: string;
  dataEmissaoNf: string | null;
  status: "pendente" | "pago" | "cancelado";
  impostoPercentualManual: number | null;
}

export interface SaidaFiltravel {
  dataPagamento: string;
  descricao: string;
  valor: number;
  responsavel: string;
}

export interface FiltrosFaturamento {
  // "YYYY-MM" escolhido no seletor; null = sem escolha explícita (vale o mês corrente só nos cards).
  mes: string | null;
  // "YYYY-MM-DD" ou "" — quando qualquer um estiver preenchido (e o intervalo for válido), vale
  // no lugar do mês.
  de: string;
  ate: string;
  // A busca é por visão: o texto digitado em Saídas não pode zerar as Entradas dos cards.
  buscaEntradas: string;
  buscaSaidas: string;
  clienteId: string; // "todos" = sem filtro
  responsavel: string; // "todos" = sem filtro
}

export const FILTROS_INICIAIS: FiltrosFaturamento = {
  mes: null,
  de: "",
  ate: "",
  buscaEntradas: "",
  buscaSaidas: "",
  clienteId: "todos",
  responsavel: "todos",
};

export function haFiltroAtivo(f: FiltrosFaturamento): boolean {
  return (
    f.mes !== null ||
    f.de !== "" ||
    f.ate !== "" ||
    f.buscaEntradas.trim() !== "" ||
    f.buscaSaidas.trim() !== "" ||
    f.clienteId !== "todos" ||
    f.responsavel !== "todos"
  );
}

export type Periodo =
  | { tipo: "mes"; chave: string }
  | { tipo: "intervalo"; de: string | null; ate: string | null };

export function intervaloInvalido(de: string, ate: string): boolean {
  return de !== "" && ate !== "" && de > ate;
}

export function intervaloAtivo(f: Pick<FiltrosFaturamento, "de" | "ate">): boolean {
  return (f.de !== "" || f.ate !== "") && !intervaloInvalido(f.de, f.ate);
}

// Período escolhido EXPLICITAMENTE pelo usuário — null = nenhuma escolha (tabela sem filtro de
// data). Intervalo vence o mês. Intervalo com De > Até é ignorado (a tela mostra o erro) em vez
// de zerar a tabela em silêncio.
export function periodoEscolhido(f: FiltrosFaturamento): Periodo | null {
  if (intervaloAtivo(f)) return { tipo: "intervalo", de: f.de || null, ate: f.ate || null };
  if (f.mes) return { tipo: "mes", chave: f.mes };
  return null;
}

// Período dos cards: o escolhido, ou o mês corrente quando não há escolha (comportamento de
// abertura).
export function periodoDosCards(f: FiltrosFaturamento, chaveMesCorrente: string): Periodo {
  return periodoEscolhido(f) ?? { tipo: "mes", chave: chaveMesCorrente };
}

// Datas são "YYYY-MM-DD" (coluna DATE) e comparadas como texto — nunca via new Date(iso), que
// vira um dia pra trás por fuso (mesmo cuidado de formatarData na tela).
export function dataNoPeriodo(data: string, periodo: Periodo): boolean {
  if (periodo.tipo === "mes") return data.startsWith(periodo.chave);
  if (periodo.de && data < periodo.de) return false;
  if (periodo.ate && data > periodo.ate) return false;
  return true;
}

export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function contem(campos: (string | null)[], buscaNormalizada: string): boolean {
  return campos.some((c) => c != null && normalizarTexto(c).includes(buscaNormalizada));
}

// "YYYY-MM" -> "MM/YYYY"
export function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split("-");
  return `${mes}/${ano}`;
}

export function filtrarEntradas<T extends EntradaFiltravel>(
  rows: T[],
  opcoes: { busca: string; clienteId: string; periodo: Periodo | null }
): T[] {
  const busca = normalizarTexto(opcoes.busca);
  return rows.filter((r) => {
    if (opcoes.clienteId !== "todos" && r.clienteId !== opcoes.clienteId) return false;
    if (opcoes.periodo && !dataNoPeriodo(r.dataVencimento, opcoes.periodo)) return false;
    if (busca && !contem([r.clienteNome, r.numeroNf, r.observacoes], busca)) return false;
    return true;
  });
}

export function filtrarSaidas<T extends SaidaFiltravel>(
  saidas: T[],
  opcoes: { busca: string; responsavel: string; periodo: Periodo | null }
): T[] {
  const busca = normalizarTexto(opcoes.busca);
  return saidas.filter((s) => {
    if (opcoes.responsavel !== "todos" && s.responsavel !== opcoes.responsavel) return false;
    if (opcoes.periodo && !dataNoPeriodo(s.dataPagamento, opcoes.periodo)) return false;
    if (busca && !contem([s.descricao, s.responsavel], busca)) return false;
    return true;
  });
}

// Entradas que compõem os cards: mesmos filtros da tabela (menos a aba de status, que é só
// navegação), com o mês corrente como período quando nada foi escolhido. Cancelado fica de
// fora: DECISÃO DE NEGÓCIO CONFIRMADA COM O OLVER — lançamento cancelado não é faturamento, então
// não pode inflar Total Entrada nem Líquido (a tabela continua listando os cancelados na aba
// própria).
export function entradasDosCards<T extends EntradaFiltravel>(
  rows: T[],
  f: FiltrosFaturamento,
  chaveMesCorrente: string
): T[] {
  return filtrarEntradas(rows, {
    busca: f.buscaEntradas,
    clienteId: f.clienteId,
    periodo: periodoDosCards(f, chaveMesCorrente),
  }).filter((r) => r.status !== "cancelado");
}

// Saída não tem status: já nasce paga (ver ContaPagarRow), então não há cancelada a excluir.
export function saidasDosCards<T extends SaidaFiltravel>(
  saidas: T[],
  f: FiltrosFaturamento,
  chaveMesCorrente: string
): T[] {
  return filtrarSaidas(saidas, {
    busca: f.buscaSaidas,
    responsavel: f.responsavel,
    periodo: periodoDosCards(f, chaveMesCorrente),
  });
}

// Mesma regra do Valor Líquido por linha da tabela: o percentual manual do lançamento sempre
// vence; senão vale o imposto do mês de EMISSÃO da NF/Acordo; sem os dois, desconhecido.
export function percentualEfetivo(
  row: Pick<EntradaFiltravel, "impostoPercentualManual" | "dataEmissaoNf">,
  impostosPorMes: Record<string, number>
): number | null {
  if (row.impostoPercentualManual != null) return row.impostoPercentualManual;
  if (!row.dataEmissaoNf) return null;
  return impostosPorMes[row.dataEmissaoNf.slice(0, 7)] ?? null;
}

export interface LiquidoCalculado {
  // Soma do líquido só das linhas com percentual conhecido. null = nenhuma linha tem percentual
  // (mostrar o aviso em vez de R$ 0,00, que passaria a falsa impressão de líquido zerado).
  valor: number | null;
  // Alguma linha ficou sem percentual: o valor acima é parcial e o Saldo não é calculado.
  parcial: boolean;
  // Meses de emissão ("MM/AAAA") sem imposto informado, para o aviso.
  mesesSemImposto: string[];
  // Linhas sem percentual manual e sem data de emissão (não dá nem pra dizer qual mês falta).
  semDataEmissao: number;
}

// Líquido por lançamento (não "total × % de um mês"): o intervalo cruza meses e cada entrada é
// abatida pelo seu próprio percentual efetivo, igual à coluna Valor Líquido da tabela.
export function calcularLiquido(
  entradas: Pick<EntradaFiltravel, "valor" | "impostoPercentualManual" | "dataEmissaoNf">[],
  impostosPorMes: Record<string, number>
): LiquidoCalculado {
  let soma = 0;
  let conhecidos = 0;
  const faltando = new Set<string>();
  let semDataEmissao = 0;
  for (const e of entradas) {
    const pct = percentualEfetivo(e, impostosPorMes);
    if (pct != null) {
      soma += e.valor - (e.valor * pct) / 100;
      conhecidos++;
    } else if (e.dataEmissaoNf) {
      faltando.add(e.dataEmissaoNf.slice(0, 7));
    } else {
      semDataEmissao++;
    }
  }
  const parcial = conhecidos < entradas.length;
  return {
    valor: entradas.length === 0 ? 0 : conhecidos === 0 ? null : soma,
    parcial,
    mesesSemImposto: Array.from(faltando).sort().map(rotuloMes),
    semDataEmissao,
  };
}

export interface TotaisCards {
  totalEntrada: number;
  totalSaida: number;
  liquido: LiquidoCalculado;
  // Só existe com o líquido completo: um saldo calculado sobre líquido parcial enganaria.
  saldoLiquido: number | null;
}

export function calcularCards(
  entradas: EntradaFiltravel[],
  saidas: SaidaFiltravel[],
  impostosPorMes: Record<string, number>
): TotaisCards {
  const totalEntrada = entradas.reduce((s, r) => s + r.valor, 0);
  const totalSaida = saidas.reduce((s, r) => s + r.valor, 0);
  const liquido = calcularLiquido(entradas, impostosPorMes);
  const saldoLiquido = liquido.valor != null && !liquido.parcial ? liquido.valor - totalSaida : null;
  return { totalEntrada, totalSaida, liquido, saldoLiquido };
}
