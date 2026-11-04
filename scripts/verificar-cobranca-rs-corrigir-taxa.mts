// Correção da taxa (%) de cobrança R&S já aprovada (POST /api/cobrancas-rs/[id]/corrigir-taxa) e propagação da data de
// vencimento ao lançamento em Faturamento Unidades. Cobre o cálculo, os bloqueios por status/gate/valor, a propagação para a
// contratação e o lançamento (pendente muda, pago não), o rollback em falha e o vencimento.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-cobranca-rs-corrigir-taxa.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, importar, chamar, auditoria, novoDb } from "./harness-mot/ambiente.mjs";
import { calcularFeeValor, validarCorrecaoDeTaxa, avisoLancamentoPago, separarLancamentos, separarPorValorAntigo, AVISO_LANCAMENTO_AJUSTADO } from "../src/lib/cobrancaRSCorrecao";
import { marcadorCobrancaNaObservacao } from "../src/lib/cobrancaRSFaturamento";
import { cobrancaRsCorrigirTaxaSchema, parseBody } from "../src/lib/schemas";

congelarData();
const rotaTaxa = await importar("src/app/api/cobrancas-rs/[id]/corrigir-taxa/route.ts");
const rotaVenc = await importar("src/app/api/cobrancas-rs/[id]/vencimento/route.ts");

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const COB = "c0b0c0b0-0000-4000-8000-000000000001";
const CV = "c0b0c0b0-0000-4000-8000-000000000002";
const LANC = "c0b0c0b0-0000-4000-8000-000000000003";
const LANC2 = "c0b0c0b0-0000-4000-8000-000000000004";

function cenario(extraCob: Record<string, unknown> = {}, opcoes: { lancamentos?: Record<string, unknown>[]; semCv?: boolean } = {}) {
  const db = novoDb(); logar(db, "dir");
  db.tabelas.cobrancas_rs = [{
    id: COB, tipo: "contratacao", status: "aprovada_enviada", salario: 2000, fee_percentual: 10, fee_valor: 200, candidato_vaga_id: CV, gerado_por_user_id: "u-ana",
    cliente_nome_snapshot: "Cliente Um", candidato_nome_snapshot: "Joao", data_vencimento: null, revisado_por: "u-dir", cargo: "Auxiliar", ...extraCob,
  }];
  db.tabelas.candidatos_vagas = opcoes.semCv ? [] : [{ id: CV, admissao_fee_percentual: 10, admissao_fee_valor: 200 }];
  db.tabelas.contas_receber_hortolandia = opcoes.lancamentos ?? [
    { id: LANC, status: "pendente", valor: 200, data_vencimento: "2026-12-10", observacoes: `Cobrança R&S ${marcadorCobrancaNaObservacao(COB)}` },
    { id: "outro-lanc", status: "pendente", valor: 999, data_vencimento: "2026-12-10", observacoes: "outra coisa (cobrança zzzzzzzz)" },
  ];
  db.tabelas.audit_logs = [];
  return db;
}
const corrigir = (corpo: unknown) => chamar(rotaTaxa.POST, { metodo: "POST", params: { id: COB }, corpo });
const cob = (db: any) => db.tabelas.cobrancas_rs[0];
const cv = (db: any) => db.tabelas.candidatos_vagas[0];
const lanc = (db: any, id = LANC) => db.tabelas.contas_receber_hortolandia.find((l: any) => l.id === id);
const semMudanca = (db: any) => {
  assert.equal(cob(db).fee_percentual, 10); assert.equal(cob(db).fee_valor, 200);
  if (cv(db)) { assert.equal(cv(db).admissao_fee_percentual, 10); assert.equal(cv(db).admissao_fee_valor, 200); }
  if (lanc(db)) assert.equal(lanc(db).valor, 200);
};

// ── Cálculo ──
await ok("calcularFeeValor: mesma conta do /aprovar (centavos arredondados) e a fórmula do /aprovar continua a mesma no código", () => {
  const formulaAprovar = (sal: number, pct: number) => Math.round(((sal * pct) / 100) * 100) / 100;
  for (const [sal, pct] of [[2000, 10], [1837.4, 12.5], [3333.33, 7.77], [1000, 0.01], [999.99, 100], [2500.5, 33.333], [0.01, 50]] as const) assert.equal(calcularFeeValor(sal, pct), formulaAprovar(sal, pct), `${sal}×${pct}`);
  assert.equal(calcularFeeValor(2000, 10), 200);
  assert.equal(calcularFeeValor(1837.4, 12.5), 229.68);
  const fonte = fs.readFileSync("src/app/api/cobrancas-rs/[id]/aprovar/route.ts", "utf8");
  assert.ok(fonte.includes("Math.round(((salario * feePercentual) / 100) * 100) / 100"), "fórmula do /aprovar mudou: revisar calcularFeeValor");
});
await ok("schema: 0 < x <= 100; zero, negativo, acima de 100, texto, null e ausente são recusados", () => {
  for (const v of [0.01, 1, 12.5, 100]) assert.equal(cobrancaRsCorrigirTaxaSchema.safeParse({ fee_percentual: v }).success, true, String(v));
  for (const v of [0, -1, 100.01, 101, "10", null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(cobrancaRsCorrigirTaxaSchema.safeParse({ fee_percentual: v }).success, false, String(v));
  assert.equal(cobrancaRsCorrigirTaxaSchema.safeParse({}).success, false);
  assert.match((parseBody(cobrancaRsCorrigirTaxaSchema, { fee_percentual: 0 }) as any).error, /maior que 0 e até 100/);
});

// ── Bloqueios por status (regra pura) ──
await ok("validarCorrecaoDeTaxa: só aprovada_enviada e validada passam; pendente_revisao, paga e cancelada têm mensagem própria", () => {
  for (const status of ["aprovada_enviada", "validada"]) assert.deepEqual(validarCorrecaoDeTaxa({ status, salario: 2000 }, 12), { ok: true, feeValor: 240 });
  assert.match((validarCorrecaoDeTaxa({ status: "pendente_revisao", salario: 2000 }, 12) as any).error, /em revisão/);
  assert.match((validarCorrecaoDeTaxa({ status: "paga", salario: 2000 }, 12) as any).error, /já foi paga/);
  assert.match((validarCorrecaoDeTaxa({ status: "cancelada", salario: 2000 }, 12) as any).error, /foi cancelada/);
  assert.equal(validarCorrecaoDeTaxa({ status: "qualquer", salario: 2000 }, 12).ok, false);
  for (const sal of [null, 0, -5]) assert.match((validarCorrecaoDeTaxa({ status: "validada", salario: sal }, 12) as any).error, /salário válido/);
  for (const pct of [0, -1, 100.5, Number.NaN]) assert.match((validarCorrecaoDeTaxa({ status: "validada", salario: 2000 }, pct) as any).error, /maior que 0 e até 100/);
});

// ── Rota: caminho feliz e propagação ──
await ok("aprovada_enviada: corrige cobrança, contratação e lançamento pendente; o lançamento de outra cobrança não é tocado; auditoria com antes/depois", async () => {
  const db = cenario();
  const r = await corrigir({ fee_percentual: 12.5 });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(cob(db).fee_percentual, 12.5); assert.equal(cob(db).fee_valor, 250);
  assert.equal(cv(db).admissao_fee_percentual, 12.5); assert.equal(cv(db).admissao_fee_valor, 250);
  assert.equal(lanc(db).valor, 250);
  assert.equal(lanc(db, "outro-lanc").valor, 999);
  assert.equal(cob(db).status, "aprovada_enviada", "status não muda");
  assert.deepEqual(r.corpo.avisos, []);
  assert.equal(r.corpo.lancamentos_atualizados, 1);
  const a = auditoria(db).find((x: any) => x.acao === "cobranca_rs_taxa_corrigida");
  assert.deepEqual(a.detalhes.antes, { fee_percentual: 10, fee_valor: 200 });
  assert.deepEqual(a.detalhes.depois, { fee_percentual: 12.5, fee_valor: 250 });
  assert.deepEqual(a.detalhes.lancamentos_atualizados, [{ id: LANC, valor_antes: 200, valor_depois: 250 }]);
});
await ok("validada também corrige", async () => {
  const db = cenario({ status: "validada", data_vencimento: "2026-12-10" });
  const r = await corrigir({ fee_percentual: 8 });
  assert.equal(r.status, 200);
  assert.equal(cob(db).fee_valor, 160); assert.equal(lanc(db).valor, 160); assert.equal(cv(db).admissao_fee_valor, 160);
});
await ok("pendente_revisao, paga e cancelada: 400 com mensagem e NADA muda (cobrança, contratação, lançamento, auditoria)", async () => {
  for (const [status, trecho] of [["pendente_revisao", /em revisão/], ["paga", /já foi paga/], ["cancelada", /foi cancelada/]] as const) {
    const db = cenario({ status });
    const r = await corrigir({ fee_percentual: 15 });
    assert.equal(r.status, 400, status);
    assert.match(r.corpo.error, trecho);
    semMudanca(db);
    assert.equal(auditoria(db).length, 0);
  }
});
await ok("taxa inválida (0, negativa, > 100, texto, ausente, corpo vazio): 400 e nada muda", async () => {
  for (const corpo of [{ fee_percentual: 0 }, { fee_percentual: -3 }, { fee_percentual: 100.01 }, { fee_percentual: "12" }, {}, undefined]) {
    const db = cenario();
    const r = await corrigir(corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    semMudanca(db);
  }
});
await ok("cobrança sem salário válido: 400 e nada muda", async () => {
  const db = cenario({ salario: null });
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 400); assert.match(r.corpo.error, /salário válido/);
  assert.equal(cob(db).fee_percentual, 10);
});
await ok("gate: analista sem acesso e que não gerou a cobrança → 403; quem gerou → 200; sem login → 401; cobrança inexistente → 404", async () => {
  let db = cenario({ gerado_por_user_id: "outra-pessoa" }); logar(db, "ana");
  assert.equal((await corrigir({ fee_percentual: 12 })).status, 403); semMudanca(db);
  db = cenario({ gerado_por_user_id: "u-ana" }); logar(db, "ana");
  assert.equal((await corrigir({ fee_percentual: 12 })).status, 200);
  db = cenario(); logar(db, null);
  assert.equal((await corrigir({ fee_percentual: 12 })).status, 401);
  db = cenario(); db.tabelas.cobrancas_rs = [];
  assert.equal((await corrigir({ fee_percentual: 12 })).status, 404);
});
await ok("mesma taxa: 200 sem gravar e sem auditar (alterado:false)", async () => {
  const db = cenario();
  const r = await corrigir({ fee_percentual: 10 });
  assert.equal(r.status, 200); assert.equal(r.corpo.alterado, false);
  assert.equal(db.consultas.filter((c: any) => c.op !== "select").length, 0);
  assert.equal(auditoria(db).length, 0);
});

// ── Lançamento pago / ausente / cobrança de cancelamento ──
await ok("lançamento PAGO não é alterado e a rota devolve o aviso; pendente do mesmo marcador é atualizado", async () => {
  const marcador = `Cobrança R&S ${marcadorCobrancaNaObservacao(COB)}`;
  const db = cenario({}, { lancamentos: [
    { id: LANC, status: "pago", valor: 200, data_vencimento: "2026-12-10", observacoes: marcador },
    { id: LANC2, status: "pendente", valor: 200, data_vencimento: "2026-12-10", observacoes: marcador },
  ] });
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 200);
  assert.equal(lanc(db, LANC).valor, 200, "pago intocado");
  assert.equal(lanc(db, LANC2).valor, 240, "pendente atualizado");
  assert.equal(r.corpo.avisos.length, 1);
  assert.match(r.corpo.avisos[0], /já está pago e não foi alterado/);
  assert.match(r.corpo.avisos[0], /R\$\s?200,00/);
  assert.deepEqual(auditoria(db).find((x: any) => x.acao === "cobranca_rs_taxa_corrigida").detalhes.lancamentos_pagos_nao_alterados, [LANC]);
});
await ok("lançamento pendente com valor AJUSTADO À MÃO (diferente do fee antigo) não é alterado: aviso na resposta e quais ficaram de fora na auditoria", async () => {
  const marcador = `Cobrança R&S ${marcadorCobrancaNaObservacao(COB)}`;
  const db = cenario({}, { lancamentos: [{ id: LANC, status: "pendente", valor: 180, data_vencimento: "2026-12-10", observacoes: marcador }] });
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 200);
  assert.equal(lanc(db).valor, 180, "valor ajustado na mão é preservado");
  assert.equal(cob(db).fee_valor, 240); assert.equal(cv(db).admissao_fee_valor, 240, "cobrança e contratação seguem corrigidas");
  assert.deepEqual(r.corpo.avisos, [AVISO_LANCAMENTO_AJUSTADO]);
  assert.equal(r.corpo.avisos[0], "O lançamento em Faturamento Unidades tem valor ajustado manualmente e não foi alterado. Confira se precisa corrigir.");
  assert.equal(r.corpo.lancamentos_atualizados, 0);
  const a = auditoria(db).find((x: any) => x.acao === "cobranca_rs_taxa_corrigida");
  assert.deepEqual(a.detalhes.lancamentos_valor_ajustado_nao_alterados, [{ id: LANC, valor: 180 }]);
  assert.deepEqual(a.detalhes.lancamentos_atualizados, []);
});
await ok("pendentes mistos: o que tem o valor antigo é atualizado, o ajustado na mão não; pago continua só com aviso (2 avisos, nessa ordem)", async () => {
  const marcador = `Cobrança R&S ${marcadorCobrancaNaObservacao(COB)}`;
  const db = cenario({}, { lancamentos: [
    { id: LANC, status: "pendente", valor: 200, data_vencimento: "2026-12-10", observacoes: marcador },
    { id: LANC2, status: "pendente", valor: 150.5, data_vencimento: "2026-12-10", observacoes: marcador },
    { id: "pago-1", status: "pago", valor: 200, data_vencimento: "2026-12-10", observacoes: marcador },
  ] });
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 200);
  assert.equal(lanc(db, LANC).valor, 240); assert.equal(lanc(db, LANC2).valor, 150.5); assert.equal(lanc(db, "pago-1").valor, 200);
  assert.equal(r.corpo.lancamentos_atualizados, 1);
  assert.equal(r.corpo.avisos.length, 2);
  assert.equal(r.corpo.avisos[0], AVISO_LANCAMENTO_AJUSTADO); assert.match(r.corpo.avisos[1], /já está pago/);
  const a = auditoria(db).find((x: any) => x.acao === "cobranca_rs_taxa_corrigida");
  assert.deepEqual(a.detalhes.lancamentos_atualizados, [{ id: LANC, valor_antes: 200, valor_depois: 240 }]);
  assert.deepEqual(a.detalhes.lancamentos_valor_ajustado_nao_alterados, [{ id: LANC2, valor: 150.5 }]);
});
await ok("separarPorValorAntigo compara em CENTAVOS: 229.68 igual a 229.68 (ponto flutuante), 200.01 difere de 200.00, fee antigo nulo = tudo divergente", () => {
  const l = (valor: number) => ({ id: String(valor), status: "pendente", valor, data_vencimento: "x" });
  assert.deepEqual(separarPorValorAntigo([l(229.68), l(229.6800000001), l(229.69)], 229.68).alinhados.map((x) => x.valor), [229.68, 229.6800000001]);
  assert.deepEqual(separarPorValorAntigo([l(229.68), l(229.6800000001), l(229.69)], 229.68).divergentes.map((x) => x.valor), [229.69]);
  assert.equal(separarPorValorAntigo([l(200.01)], 200).alinhados.length, 0);
  assert.equal(separarPorValorAntigo([l(200)], 200).alinhados.length, 1);
  const semAntigo = separarPorValorAntigo([l(0), l(200)], null);
  assert.deepEqual([semAntigo.alinhados.length, semAntigo.divergentes.length], [0, 2]);
});
await ok("lançamento cancelado é ignorado (sem mudança e sem aviso); sem lançamento nenhum: tudo certo e sem aviso", async () => {
  const marcador = `Cobrança R&S ${marcadorCobrancaNaObservacao(COB)}`;
  let db = cenario({}, { lancamentos: [{ id: LANC, status: "cancelado", valor: 200, data_vencimento: "2026-12-10", observacoes: marcador }] });
  let r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 200); assert.equal(lanc(db).valor, 200); assert.deepEqual(r.corpo.avisos, []);
  db = cenario({}, { lancamentos: [] });
  r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 200); assert.deepEqual(r.corpo.avisos, []); assert.equal(cob(db).fee_valor, 240);
});
await ok("cobrança de cancelamento (sem candidatura): corrige cobrança e lançamento e não mexe em candidatos_vagas", async () => {
  const db = cenario({ tipo: "cancelamento", candidato_vaga_id: null, candidato_nome_snapshot: null });
  const r = await corrigir({ fee_percentual: 20 });
  assert.equal(r.status, 200);
  assert.equal(cob(db).fee_valor, 400); assert.equal(lanc(db).valor, 400);
  assert.equal(cv(db).admissao_fee_percentual, 10); assert.equal(cv(db).admissao_fee_valor, 200);
});
await ok("candidatura não encontrada: cobrança e lançamento corrigidos, com aviso sobre a contratação", async () => {
  const db = cenario({}, { semCv: true });
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 200);
  assert.equal(cob(db).fee_valor, 240); assert.equal(lanc(db).valor, 240);
  assert.ok(r.corpo.avisos.some((a: string) => /contratação desta cobrança não foi encontrada/.test(a)));
});

// ── Falha no meio: nada fica pela metade ──
await ok("falha ao atualizar o lançamento: 500 e cobrança + contratação voltam ao que eram", async () => {
  const db = cenario();
  db.falhas["contas_receber_hortolandia.update"] = "falha simulada";
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 500); assert.match(r.corpo.error, /Nada foi alterado/);
  semMudanca(db);
  assert.ok(auditoria(db).some((x: any) => x.acao === "cobranca_rs_taxa_corrigida_erro_lancamento"));
  assert.equal(auditoria(db).some((x: any) => x.acao === "cobranca_rs_taxa_corrigida"), false);
});
await ok("falha ao ler os lançamentos: 500 e tudo volta", async () => {
  const db = cenario();
  db.falhas["contas_receber_hortolandia.select"] = "falha simulada";
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 500); semMudanca(db);
});
await ok("falha ao atualizar a contratação: 500 e a cobrança volta ao que era (lançamento nem é tocado)", async () => {
  const db = cenario();
  db.falhas["candidatos_vagas.update"] = "falha simulada";
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 500); semMudanca(db);
});
await ok("status mudou entre a leitura e a gravação (ex.: marcada como paga): 409 e nada é gravado", async () => {
  const db = cenario();
  db.ganchos = { "cobrancas_rs.update": async () => { cob(db).status = "paga"; } };
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 409);
  assert.equal(cob(db).fee_percentual, 10); assert.equal(cv(db).admissao_fee_valor, 200); assert.equal(lanc(db).valor, 200);
});
await ok("falha ao gravar a cobrança: 500 e nada mais é tocado", async () => {
  const db = cenario();
  db.falhas["cobrancas_rs.update"] = "falha simulada";
  const r = await corrigir({ fee_percentual: 12 });
  assert.equal(r.status, 500); semMudanca(db);
});

// ── Vencimento propaga ao lançamento ──
const venc = (corpo: unknown) => chamar(rotaVenc.PATCH, { metodo: "PATCH", params: { id: COB }, corpo });
await ok("vencimento: nova data vai para o lançamento pendente (e só ele); status vira validada como antes", async () => {
  const db = cenario();
  const r = await venc({ data_vencimento: "2026-12-20" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(cob(db).data_vencimento, "2026-12-20"); assert.equal(cob(db).status, "validada");
  assert.equal(lanc(db).data_vencimento, "2026-12-20");
  assert.equal(lanc(db, "outro-lanc").data_vencimento, "2026-12-10");
  assert.deepEqual(r.corpo.avisos, []);
  assert.deepEqual(auditoria(db).find((x: any) => x.acao === "cobranca_rs_vencimento_definido").detalhes.lancamentos_atualizados, [{ id: LANC, de: "2026-12-10", para: "2026-12-20" }]);
});
await ok("vencimento: lançamento pago não é alterado e a rota devolve o aviso; a cobrança ainda muda de data", async () => {
  const marcador = `Cobrança R&S ${marcadorCobrancaNaObservacao(COB)}`;
  const db = cenario({ status: "validada", data_vencimento: "2026-12-10" }, { lancamentos: [{ id: LANC, status: "pago", valor: 200, data_vencimento: "2026-12-10", observacoes: marcador }] });
  const r = await venc({ data_vencimento: "2026-12-25" });
  assert.equal(r.status, 200);
  assert.equal(cob(db).data_vencimento, "2026-12-25"); assert.equal(lanc(db).data_vencimento, "2026-12-10");
  assert.equal(r.corpo.avisos.length, 1); assert.match(r.corpo.avisos[0], /já está pago/); assert.match(r.corpo.avisos[0], /10\/12\/2026/);
});
await ok("vencimento: mesma data não mexe no lançamento; apagar a data volta a aprovada_enviada e o lançamento mantém a data (coluna não aceita vazio) com aviso", async () => {
  let db = cenario({ status: "validada", data_vencimento: "2026-12-10" });
  let r = await venc({ data_vencimento: "2026-12-10" });
  assert.equal(r.status, 200);
  assert.equal(db.consultas.filter((c: any) => c.tabela === "contas_receber_hortolandia").length, 0, "nem consulta o lançamento");
  db = cenario({ status: "validada", data_vencimento: "2026-12-10" });
  r = await venc({ data_vencimento: null });
  assert.equal(r.status, 200);
  assert.equal(cob(db).status, "aprovada_enviada"); assert.equal(cob(db).data_vencimento, null);
  assert.equal(lanc(db).data_vencimento, "2026-12-10");
  assert.equal(r.corpo.avisos.length, 1); assert.match(r.corpo.avisos[0], /exige data/);
});
await ok("vencimento: sem lançamento nada muda além do de sempre; paga continua bloqueada", async () => {
  let db = cenario({}, { lancamentos: [] });
  let r = await venc({ data_vencimento: "2026-12-20" });
  assert.equal(r.status, 200); assert.equal(cob(db).status, "validada"); assert.deepEqual(r.corpo.avisos, []);
  db = cenario({ status: "paga" });
  r = await venc({ data_vencimento: "2026-12-20" });
  assert.equal(r.status, 400); assert.equal(lanc(db).data_vencimento, "2026-12-10");
});
await ok("vencimento: falha ao atualizar o lançamento → 500 e a cobrança volta (data e status), sem e-mail", async () => {
  const db = cenario();
  db.falhas["contas_receber_hortolandia.update"] = "falha simulada";
  const r = await venc({ data_vencimento: "2026-12-20" });
  assert.equal(r.status, 500);
  assert.equal(cob(db).data_vencimento, null); assert.equal(cob(db).status, "aprovada_enviada");
  assert.equal(lanc(db).data_vencimento, "2026-12-10");
  assert.equal((db.emails ?? []).length, 0);
});

// ── helpers de aviso ──
await ok("avisoLancamentoPago: nenhum pago = sem aviso; plural no texto", () => {
  assert.equal(avisoLancamentoPago([], { campo: "valor" }), null);
  const pagos = [{ id: "a", status: "pago", valor: 10, data_vencimento: "2026-01-02" }, { id: "b", status: "pago", valor: 20, data_vencimento: "2026-01-03" }];
  assert.match(avisoLancamentoPago(pagos, { campo: "valor" })!, /Há lançamentos .* já estão pagos/);
  const { pendentes, pagos: so } = separarLancamentos([...pagos, { id: "c", status: "pendente", valor: 1, data_vencimento: "x" }, { id: "d", status: "cancelado", valor: 1, data_vencimento: "x" }]);
  assert.deepEqual([pendentes.length, so.length], [1, 2]);
});

console.log(`\n${n} verificações OK`);
