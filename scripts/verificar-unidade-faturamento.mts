// Verificação da unidade de faturamento (o projeto não tem runner de testes).
// Rodar: node --experimental-strip-types scripts/verificar-unidade-faturamento.mts
// Mutações (prova que os testes pegam regressão): node --experimental-strip-types scripts/verificar-unidade-faturamento-mutacoes.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcularCards, type EntradaFiltravel } from "../src/lib/faturamentoUnidadesFiltros.ts";

const lib = await import(process.env.UF_LIB ?? "../src/lib/unidadeFaturamento.ts");
const { bucketFaturamento, filtrarPorBucket, contarPorBucket, decidirUnidadeFaturamento, lerBucketFaturamento, usaUnidadeFaturamento, ehUnidadeFaturamento } = lib;
const sql = readFileSync(process.env.UF_MIGRATION ?? new URL("../supabase/migration_unidade_faturamento.sql", import.meta.url), "utf8");

let n = 0;
function caso(nome: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${nome}`);
}

// ── NULL nunca some ──
caso("bucket: NULL, vazio e valor desconhecido caem em 'a_definir' (nunca somem)", () => {
  assert.equal(bucketFaturamento(null), "a_definir");
  assert.equal(bucketFaturamento(undefined), "a_definir");
  assert.equal(bucketFaturamento(""), "a_definir");
  assert.equal(bucketFaturamento("sbc"), "a_definir");
  assert.equal(bucketFaturamento("hortolandia"), "hortolandia");
  assert.equal(bucketFaturamento("monte_mor"), "monte_mor");
});
const itens = [
  { id: 1, unidadeFaturamento: "hortolandia" },
  { id: 2, unidadeFaturamento: "monte_mor" },
  { id: 3, unidadeFaturamento: null },
  { id: 4, unidadeFaturamento: "lixo" },
  { id: 5, unidadeFaturamento: "hortolandia" },
];
caso("abas particionam: cada item aparece em exatamente uma aba e a soma das abas = total", () => {
  const h = filtrarPorBucket(itens, "hortolandia"), m = filtrarPorBucket(itens, "monte_mor"), a = filtrarPorBucket(itens, "a_definir");
  assert.deepEqual(h.map((i) => i.id), [1, 5]);
  assert.deepEqual(m.map((i) => i.id), [2]);
  assert.deepEqual(a.map((i) => i.id), [3, 4]);
  assert.equal(h.length + m.length + a.length, itens.length);
});
caso("contagem por aba bate com o filtro (inclui 'a definir')", () => {
  assert.deepEqual(contarPorBucket(itens), { hortolandia: 2, monte_mor: 1, a_definir: 2 });
});

// ── Imposto do mês: mesmo resultado com abas ──
caso("imposto/líquido: soma dos cards das abas == cards da unidade inteira (partição aditiva)", () => {
  const impostos = { "2026-09": 10, "2026-10": 5 };
  const e = (valor: number, uf: string | null, extra: Partial<EntradaFiltravel> = {}) => ({
    clienteId: "c", clienteNome: "C", numeroNf: null, observacoes: null, valor, dataVencimento: "2026-10-10", dataEmissaoNf: "2026-10-01",
    status: "pendente" as const, impostoPercentualManual: null, unidadeFaturamento: uf, ...extra,
  });
  const todas = [e(1000, "hortolandia"), e(2000, "monte_mor"), e(700, null), e(400, "hortolandia", { impostoPercentualManual: 0 }), e(900, "monte_mor", { dataEmissaoNf: "2026-09-02" })];
  const saidas = [{ dataPagamento: "2026-10-05", descricao: "x", valor: 300, responsavel: "R", unidadeFaturamento: "hortolandia" }, { dataPagamento: "2026-10-06", descricao: "y", valor: 50, responsavel: "R", unidadeFaturamento: null }];
  const total = calcularCards(todas, saidas, impostos);
  const partes = (["hortolandia", "monte_mor", "a_definir"] as const).map((b) => calcularCards(filtrarPorBucket(todas, b), filtrarPorBucket(saidas, b), impostos));
  const soma = (f: (c: typeof total) => number) => partes.reduce((s, c) => s + f(c), 0);
  assert.equal(soma((c) => c.totalEntrada), total.totalEntrada);
  assert.equal(soma((c) => c.totalSaida), total.totalSaida);
  assert.ok(Math.abs(soma((c) => c.liquido.valor ?? 0) - (total.liquido.valor ?? 0)) < 1e-9);
});

// ── Gravação: obrigatório na criação, SBC ignora, edição tolera NULL ──
caso("criação na unidade compartilhada: sem valor (ausente ou null) é erro", () => {
  assert.equal(decidirUnidadeFaturamento("monte-mor-hortolandia", undefined, true).ok, false);
  assert.equal(decidirUnidadeFaturamento("monte-mor-hortolandia", null, true).ok, false);
});
caso("criação com valor válido grava; valor inválido é erro", () => {
  assert.deepEqual(decidirUnidadeFaturamento("monte-mor-hortolandia", "monte_mor", true), { ok: true, campo: { unidade_faturamento: "monte_mor" } });
  assert.equal(decidirUnidadeFaturamento("monte-mor-hortolandia", "sbc", true).ok, false);
});
caso("SBC não usa o campo: nada é gravado nem exigido", () => {
  assert.deepEqual(decidirUnidadeFaturamento("sbc", undefined, true), { ok: true, campo: {} });
  assert.deepEqual(decidirUnidadeFaturamento("sbc", "hortolandia", true), { ok: true, campo: {} });
  assert.equal(usaUnidadeFaturamento("sbc"), false);
  assert.equal(usaUnidadeFaturamento("monte-mor-hortolandia"), true);
});
caso("edição: ausente mantém (não toca a coluna), null volta para 'a definir', valor troca", () => {
  assert.deepEqual(decidirUnidadeFaturamento("monte-mor-hortolandia", undefined, false), { ok: true, campo: {} });
  assert.deepEqual(decidirUnidadeFaturamento("monte-mor-hortolandia", null, false), { ok: true, campo: { unidade_faturamento: null } });
  assert.deepEqual(decidirUnidadeFaturamento("monte-mor-hortolandia", "hortolandia", false), { ok: true, campo: { unidade_faturamento: "hortolandia" } });
});
caso("filtro da URL: só valores conhecidos valem", () => {
  assert.equal(lerBucketFaturamento("a_definir"), "a_definir");
  assert.equal(lerBucketFaturamento("monte_mor"), "monte_mor");
  assert.equal(lerBucketFaturamento("x"), null);
  assert.equal(lerBucketFaturamento(null), null);
  assert.equal(ehUnidadeFaturamento("hortolandia"), true);
  assert.equal(ehUnidadeFaturamento("a_definir"), false);
});

// ── Migration ──
caso("migration: aditiva e idempotente (nenhuma coluna NOT NULL, IF NOT EXISTS, constraint via DO)", () => {
  const colunas = sql.match(/ADD COLUMN IF NOT EXISTS unidade_faturamento text;/g) ?? [];
  assert.equal(colunas.length, 4);
  assert.ok(!/ADD COLUMN[^;]*NOT NULL/i.test(sql));
  assert.ok(/DO \$\$/.test(sql) && /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/.test(sql));
  assert.ok(/IN \(''monte_mor'', ''hortolandia''\)/.test(sql));
  for (const t of ["clientes", "contas_receber_hortolandia", "contas_pagar_hortolandia", "cobrancas_rs"]) assert.ok(sql.includes(`'${t}'`), t);
});
caso("migration: backfill só onde NULL (não sobrescreve), Petix = monte_mor, pagar não é preenchida", () => {
  const updates = sql.split(/\n(?=UPDATE )/).filter((b) => b.startsWith("UPDATE"));
  assert.equal(updates.length, 3);
  for (const u of updates) assert.ok(/unidade_faturamento IS NULL/.test(u), "UPDATE sem guarda IS NULL");
  assert.ok(/lower\(btrim\(c\.nome\)\) = 'petix' THEN 'monte_mor' ELSE 'hortolandia'/.test(sql));
  assert.ok(!/UPDATE public\.contas_pagar_hortolandia/.test(sql));
  assert.ok(/UPDATE public\.cobrancas_rs cb[\s\S]*c\.unidade_faturamento IS NOT NULL/.test(sql));
});

console.log(`\n${n} casos ok`);
