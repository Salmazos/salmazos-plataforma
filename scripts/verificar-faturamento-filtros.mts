// Verificação dos filtros/totais de Faturamento Unidades (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-faturamento-filtros.mts
import assert from "node:assert/strict";
import {
  FILTROS_INICIAIS,
  calcularCards,
  calcularLiquido,
  entradasDosCards,
  filtrarEntradas,
  filtrarSaidas,
  haFiltroAtivo,
  periodoDosCards,
  periodoEscolhido,
  saidasDosCards,
  type EntradaFiltravel,
  type FiltrosFaturamento,
  type SaidaFiltravel,
} from "../src/lib/faturamentoUnidadesFiltros.ts";

const MES_CORRENTE = "2026-10";
let n = 0;
function caso(nome: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${nome}`);
}

function ent(p: Partial<EntradaFiltravel>): EntradaFiltravel {
  return {
    clienteId: "c1", clienteNome: "Acme Ltda", numeroNf: "100", observacoes: null, valor: 1000,
    dataVencimento: "2026-10-10", dataEmissaoNf: "2026-10-01", status: "pendente", impostoPercentualManual: null, ...p,
  };
}
function sai(p: Partial<SaidaFiltravel>): SaidaFiltravel {
  return { dataPagamento: "2026-10-05", descricao: "Aluguel", valor: 300, responsavel: "Olver", ...p };
}
const IMPOSTOS = { "2026-09": 10, "2026-10": 5 };

const rows: EntradaFiltravel[] = [
  ent({ valor: 1000 }),
  ent({ valor: 2000, dataVencimento: "2026-09-20", dataEmissaoNf: "2026-09-05", clienteId: "c2", clienteNome: "Água & Cia", numeroNf: "77" }),
  ent({ valor: 500, status: "cancelado" }),
  ent({ valor: 400, impostoPercentualManual: 0 }),
  ent({ valor: 800, dataVencimento: "2026-11-03", dataEmissaoNf: "2026-11-01" }),
];
const saidas: SaidaFiltravel[] = [
  sai({}),
  sai({ valor: 100, dataPagamento: "2026-09-21", responsavel: "Poliana", descricao: "Café" }),
];

// ── Regra de abertura ──
caso("estado inicial: nenhum filtro ativo", () => {
  assert.equal(haFiltroAtivo(FILTROS_INICIAIS), false);
  assert.equal(periodoEscolhido(FILTROS_INICIAIS), null);
});
caso("estado inicial: tabela sem filtro de data (todos os meses, todas as linhas)", () => {
  const t = filtrarEntradas(rows, { busca: "", clienteId: "todos", periodo: periodoEscolhido(FILTROS_INICIAIS) });
  assert.equal(t.length, rows.length);
  assert.equal(filtrarSaidas(saidas, { busca: "", responsavel: "todos", periodo: null }).length, saidas.length);
});
caso("estado inicial: cards no mês corrente", () => {
  assert.deepEqual(periodoDosCards(FILTROS_INICIAIS, MES_CORRENTE), { tipo: "mes", chave: MES_CORRENTE });
  const c = entradasDosCards(rows, FILTROS_INICIAIS, MES_CORRENTE);
  assert.deepEqual(c.map((r) => r.valor), [1000, 400]); // sem cancelado, só outubro
  assert.equal(saidasDosCards(saidas, FILTROS_INICIAIS, MES_CORRENTE).length, 1);
});
caso("Limpar filtros volta exatamente ao estado de abertura (e o inicial nunca é mutado)", () => {
  const sujo: FiltrosFaturamento = { ...FILTROS_INICIAIS, mes: "2026-09", de: "2026-01-01", buscaEntradas: "x", clienteId: "c2", responsavel: "Olver" };
  assert.equal(haFiltroAtivo(sujo), true);
  const limpo = { ...FILTROS_INICIAIS };
  assert.deepEqual(limpo, FILTROS_INICIAIS);
  assert.equal(haFiltroAtivo(limpo), false);
  assert.equal(FILTROS_INICIAIS.mes, null);
});

// ── Mês / período ──
caso("mês escolhido filtra tabela E cards", () => {
  const f = { ...FILTROS_INICIAIS, mes: "2026-09" };
  assert.deepEqual(filtrarEntradas(rows, { busca: "", clienteId: "todos", periodo: periodoEscolhido(f) }).map((r) => r.valor), [2000]);
  assert.deepEqual(entradasDosCards(rows, f, MES_CORRENTE).map((r) => r.valor), [2000]);
});
caso("De/Até vence o mês e cruza meses; fronteiras inclusivas", () => {
  const f = { ...FILTROS_INICIAIS, mes: "2026-10", de: "2026-09-20", ate: "2026-10-10" };
  assert.deepEqual(entradasDosCards(rows, f, MES_CORRENTE).map((r) => r.valor), [1000, 2000, 400]);
});
caso("intervalo aberto de um lado", () => {
  assert.deepEqual(entradasDosCards(rows, { ...FILTROS_INICIAIS, de: "2026-11-01" }, MES_CORRENTE).map((r) => r.valor), [800]);
  assert.deepEqual(entradasDosCards(rows, { ...FILTROS_INICIAIS, ate: "2026-09-30" }, MES_CORRENTE).map((r) => r.valor), [2000]);
});
caso("De > Até é ignorado (não zera a tabela): cai no mês escolhido ou na abertura", () => {
  assert.equal(periodoEscolhido({ ...FILTROS_INICIAIS, de: "2026-10-31", ate: "2026-10-01" }), null);
  assert.deepEqual(periodoEscolhido({ ...FILTROS_INICIAIS, mes: "2026-09", de: "2026-10-31", ate: "2026-10-01" }), { tipo: "mes", chave: "2026-09" });
});
caso("Saídas usam data de pagamento", () => {
  const f = { ...FILTROS_INICIAIS, de: "2026-09-01", ate: "2026-09-30" };
  assert.deepEqual(saidasDosCards(saidas, f, MES_CORRENTE).map((s) => s.valor), [100]);
});

// ── Busca / cliente / responsável ──
caso("busca ignora acento e maiúscula; cobre cliente, NF e observação", () => {
  const b = (t: string) => filtrarEntradas(rows, { busca: t, clienteId: "todos", periodo: null }).length;
  assert.equal(b("agua"), 1);
  assert.equal(b("ÁGUA"), 1);
  assert.equal(b("77"), 1);
  assert.equal(b("inexistente"), 0);
  assert.equal(filtrarEntradas([ent({ observacoes: "Reajuste anual" })], { busca: "reajuste", clienteId: "todos", periodo: null }).length, 1);
});
caso("busca de Saídas não afeta Entradas dos cards (e vice-versa)", () => {
  const f = { ...FILTROS_INICIAIS, buscaSaidas: "cafe" };
  assert.equal(entradasDosCards(rows, f, MES_CORRENTE).length, 2);
  assert.equal(saidasDosCards(saidas, f, MES_CORRENTE).length, 0); // café é de setembro
  assert.equal(saidasDosCards(saidas, { ...f, de: "2026-09-01", ate: "2026-09-30" }, MES_CORRENTE).length, 1);
});
caso("filtro de cliente e de responsável afetam os cards", () => {
  assert.deepEqual(entradasDosCards(rows, { ...FILTROS_INICIAIS, mes: "2026-09", clienteId: "c1" }, MES_CORRENTE), []);
  assert.deepEqual(saidasDosCards(saidas, { ...FILTROS_INICIAIS, responsavel: "Poliana" }, MES_CORRENTE), []); // setembro fora do mês corrente
  assert.equal(saidasDosCards(saidas, { ...FILTROS_INICIAIS, mes: "2026-09", responsavel: "Poliana" }, MES_CORRENTE).length, 1);
});

// ── Cancelados ──
caso("cancelado não entra nos cards mas continua na tabela", () => {
  assert.equal(filtrarEntradas(rows, { busca: "", clienteId: "todos", periodo: { tipo: "mes", chave: "2026-10" } }).length, 3);
  assert.equal(entradasDosCards(rows, FILTROS_INICIAIS, MES_CORRENTE).some((r) => r.status === "cancelado"), false);
});

// ── Líquido por lançamento ──
caso("líquido: manual vence, senão imposto do mês de emissão", () => {
  const l = calcularLiquido([ent({ valor: 1000 }), ent({ valor: 400, impostoPercentualManual: 0 })], IMPOSTOS);
  assert.equal(l.valor, 950 + 400);
  assert.equal(l.parcial, false);
});
caso("líquido cruzando meses usa o percentual de cada lançamento", () => {
  const f = { ...FILTROS_INICIAIS, de: "2026-09-01", ate: "2026-10-31" };
  const c = calcularCards(entradasDosCards(rows, f, MES_CORRENTE), saidasDosCards(saidas, f, MES_CORRENTE), IMPOSTOS);
  assert.equal(c.totalEntrada, 3400);
  assert.equal(c.liquido.valor, 1800 + 950 + 400);
  assert.equal(c.totalSaida, 400);
  assert.equal(c.saldoLiquido, 3150 - 400);
});
caso("mês sem imposto: líquido parcial, lista o mês e Saldo vira null", () => {
  const f = { ...FILTROS_INICIAIS, de: "2026-09-01", ate: "2026-11-30" };
  const c = calcularCards(entradasDosCards(rows, f, MES_CORRENTE), saidasDosCards(saidas, f, MES_CORRENTE), IMPOSTOS);
  assert.equal(c.liquido.parcial, true);
  assert.deepEqual(c.liquido.mesesSemImposto, ["11/2026"]);
  assert.equal(c.liquido.valor, 1800 + 950 + 400);
  assert.equal(c.saldoLiquido, null);
});
caso("nenhum percentual conhecido: valor null; sem lançamentos: 0 completo", () => {
  assert.equal(calcularLiquido([ent({ dataEmissaoNf: "2026-12-01" })], IMPOSTOS).valor, null);
  assert.equal(calcularLiquido([ent({ dataEmissaoNf: null })], IMPOSTOS).semDataEmissao, 1);
  const vazio = calcularLiquido([], IMPOSTOS);
  assert.deepEqual([vazio.valor, vazio.parcial], [0, false]);
});

console.log(`\n${n} casos ok`);
