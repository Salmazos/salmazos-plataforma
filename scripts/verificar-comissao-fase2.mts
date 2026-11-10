// Comissão de analistas — FASE 2 (fechamento mensal, pagamento, CSV da folha e avisos por sino). Rotas e serviço rodam contra o banco em
// memória do harness; a função SQL comissao_fechar_mes é emulada aqui pela MESMA regra pura (selecionarParaFechamento) e a prova contra
// o Postgres real (trigger que congela o fechado, transação única, idempotência) está em scripts/verificar-comissao-fase1-banco.sh.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-comissao-fase2.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, importar, chamar, auditoria, novoDb, usuario, USUARIOS } from "./harness-mot/ambiente.mjs";
import { competenciaAtual, fechamentoLiberadoEm, mesAtrasadoDe, montarCsvFolha, selecionarParaFechamento, totalizar, mudancasPorCobranca } from "../src/lib/comissaoRegras";

congelarData(); // 07/10/2026 15:00Z => mês corrente 2026-10-01
const R = {
  marcar: await importar("src/app/api/comissoes/marcar/route.ts"),
  minhas: await importar("src/app/api/comissoes/minhas/route.ts"),
  todas: await importar("src/app/api/comissoes/route.ts"),
  contestar: await importar("src/app/api/comissoes/[id]/contestar/route.ts"),
  retro: await importar("src/app/api/comissoes/[id]/retroativo/route.ts"),
  resolver: await importar("src/app/api/comissoes/[id]/resolver-contestacao/route.ts"),
  ajuste: await importar("src/app/api/comissoes/ajuste/route.ts"),
  fechamentos: await importar("src/app/api/comissoes/fechamentos/route.ts"),
  previa: await importar("src/app/api/comissoes/fechamentos/previa/route.ts"),
  detalhe: await importar("src/app/api/comissoes/fechamentos/[id]/route.ts"),
  csv: await importar("src/app/api/comissoes/fechamentos/[id]/csv/route.ts"),
  pagar: await importar("src/app/api/comissoes/fechamentos/[id]/pagar/route.ts"),
  vencimento: await importar("src/app/api/cobrancas-rs/[id]/vencimento/route.ts"),
  corrigirTaxa: await importar("src/app/api/cobrancas-rs/[id]/corrigir-taxa/route.ts"),
  cancelar: await importar("src/app/api/cobrancas-rs/[id]/cancelar/route.ts"),
};

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

USUARIOS.gio = usuario("u-gio", "analista");
USUARIOS.reb = usuario("u-reb", "analista");
USUARIOS.outra = usuario("u-out", "analista");

const ID = (k: number) => `cccccccc-0000-4000-8000-${String(k).padStart(12, "0")}`;
const BEN_GIO = ID(901), BEN_REB = ID(902);
const P_GIO = ID(951), P_REB = ID(952), P_OUT = ID(953);
const V = ID(801);
const U1 = ID(701), U2 = ID(702); // ids de unidade em UUID (o schema da rota valida)
const SET = "2026-09-01", OUT = "2026-10-01";
let seq = 300;

function cenario() {
  const db = novoDb(); logar(db, "dir");
  const perfil = (u: string, nome: string, id: string) => ({ id, user_id: u, unidade_id: U1, acesso_todas_unidades: false, ativo: true, nome_completo: nome, nivel_acesso: "analista" });
  db.tabelas.analistas_perfil.push(perfil("u-gio", "Giovanni Prado", P_GIO), perfil("u-reb", "Rebecca Zambonini", P_REB), perfil("u-out", "Outra Analista", P_OUT));
  db.tabelas.unidades = [{ id: U1, slug: "monte-mor-hortolandia" }, { id: U2, slug: "sbc" }];
  db.tabelas.comissao_beneficiarios = [
    { id: BEN_GIO, analista_perfil_id: P_GIO, percentual: 5, ativo: true, unidade_id: U1 },
    { id: BEN_REB, analista_perfil_id: P_REB, percentual: 5, ativo: true, unidade_id: U1 },
  ];
  db.tabelas.comissao_lancamentos = [];
  db.tabelas.comissao_fechamentos = [];
  db.tabelas.notificacoes_analista = [];
  db.tabelas.vagas = [{ id: V, titulo: "Analista Fiscal", responsavel: "Rebecca", unidade_id: U1, reposicao_de_candidato_vaga_id: null }];
  db.tabelas.cobrancas_rs = [];
  db.tabelas.contas_receber_hortolandia = [];
  db.tabelas.candidatos_vagas = [];
  db.tabelas.cobranca_rs_analistas_acesso = [];
  db.tabelas.audit_logs = [];
  db.emails = [];
  // Emulação da função SQL comissao_fechar_mes (mesma regra pura; o Postgres real é provado no .sh).
  db.rpcs = {
    comissao_fechar_mes: (a: any, d: any) => {
      if (!a.p_unidade || !d.tabelas.unidades.some((u: any) => u.id === a.p_unidade)) return { data: { ok: false, codigo: "unidade_invalida" }, error: null };
      const fechs = d.tabelas.comissao_fechamentos;
      const ex = fechs.find((f: any) => f.competencia === a.p_competencia && f.unidade_id === a.p_unidade);
      if (ex) return { data: { ok: true, ja_existia: true, fechamento_id: ex.id, total: ex.total, qtd: ex.qtd_lancamentos }, error: null };
      if (a.p_competencia > competenciaAtual()) return { data: { ok: false, codigo: "mes_futuro" }, error: null };
      if (fechs.some((f: any) => f.unidade_id === a.p_unidade && f.competencia > a.p_competencia)) return { data: { ok: false, codigo: "fechamento_posterior" }, error: null };
      const doUnidade = d.tabelas.comissao_lancamentos.filter((l: any) => l.unidade_id === a.p_unidade);
      const sel = selecionarParaFechamento(doUnidade.filter((l: any) => !l.fechamento_id), a.p_competencia, new Set(doUnidade.filter((l: any) => l.fechamento_id).map((l: any) => l.id)));
      if (sel.bloqueios.length) return { data: { ok: false, codigo: "bloqueado", bloqueios: sel.bloqueios.map((id: string) => ({ id })) }, error: null };
      const ids = [...sel.comissoes, ...sel.ajustes];
      if (ids.length === 0) return { data: { ok: false, codigo: "nada_para_fechar" }, error: null };
      if ((a.p_esperado_qtd != null && a.p_esperado_qtd !== ids.length) || (a.p_esperado_total != null && a.p_esperado_total !== sel.total)) return { data: { ok: false, codigo: "mudou_desde_a_previa", qtd: ids.length, total: sel.total }, error: null };
      const id = ID(++seq);
      fechs.push({ id, competencia: a.p_competencia, unidade_id: a.p_unidade, fechado_por: a.p_usuario, fechado_em: new Date().toISOString(), total: sel.total, qtd_lancamentos: ids.length, pago_em: null, pago_registrado_por: null, pago_registrado_em: null });
      for (const l of doUnidade) if (ids.includes(l.id)) { l.fechamento_id = id; l.fechado_em = new Date().toISOString(); }
      return { data: { ok: true, ja_existia: false, fechamento_id: id, total: sel.total, qtd: ids.length }, error: null };
    },
  };
  return db;
}
function cobranca(db: any, extra: Record<string, unknown> = {}): string {
  const id = (extra.id as string) ?? ID(++seq);
  db.tabelas.cobrancas_rs.push({
    id, tipo: "contratacao", status: "validada", salario: 1000, fee_percentual: 40, fee_valor: 400, vaga_id: V, enviado_em: "2026-09-10T15:00:00.000Z",
    gerado_por_user_id: "u-reb", data_vencimento: "2026-11-10", unidade_id: U1, revisado_por: "u-dir", cliente_nome_snapshot: `Cliente ${id.slice(-3)}`, candidato_nome_snapshot: "Joao", cargo: "Fiscal", ...extra,
  });
  return id;
}
// Lançamento semeado direto no banco (o estado que o fluxo da Fase 1 produziria).
function lanc(db: any, extra: Record<string, unknown> = {}): any {
  const cobrancaId = (extra.cobranca_id as string) ?? cobranca(db);
  // Valor coerente com a cobrança (fee 400): a sincronização recalcula valor = fee × percentual aplicado, então o percentual acompanha o valor semeado.
  if (extra.valor_comissao != null && extra.percentual_aplicado === undefined && (extra.tipo ?? "comissao") === "comissao") extra = { ...extra, percentual_aplicado: (Number(extra.valor_comissao) * 100) / 400 };
  const l = {
    id: ID(++seq), cobranca_id: cobrancaId, beneficiario_id: BEN_GIO, tipo: "comissao", status: "confirmada", competencia: SET, base_valor: 400, percentual_aplicado: 5,
    valor_comissao: 20, lancamento_origem_id: null, motivo: null, marcado_por: "u-gio", unidade_id: U1, fechado_em: null, fechamento_id: null, ...extra, cobranca_id: cobrancaId,
  };
  db.tabelas.comissao_lancamentos.push(l);
  return l;
}
// Comissão "prevista" de verdade: a cobrança ainda aguarda validação (senão a sincronização a confirmaria, como deve).
const prevista = (db: any, extra: Record<string, unknown> = {}) => lanc(db, { status: "prevista", cobranca_id: cobranca(db, { status: "aprovada_enviada", data_vencimento: null }), ...extra });
const L = (db: any, id: string) => db.tabelas.comissao_lancamentos.find((l: any) => l.id === id);
// Fechar o mês corrente (outubro) só é possível depois do prazo de lançamento (dia 4 do mês seguinte): nesses casos o relógio vai para 10/11.
const fechar = async (mes: string, extra: Record<string, unknown> = {}) => {
  const depoisDoPrazo = `${mes}-01` === OUT;
  if (depoisDoPrazo) congelarData("2026-11-10T15:00:00Z");
  try { return await chamar(R.fechamentos.POST, { metodo: "POST", corpo: { competencia: mes, unidade_id: U1, ...extra } }); } finally { if (depoisDoPrazo) congelarData(); }
};
const detalhe = (id: string) => chamar(R.detalhe.GET, { params: { id } });
const sinos = (db: any, userId?: string) => db.tabelas.notificacoes_analista.filter((x: any) => !userId || x.user_id === userId);

// ── 1) Regra pura de seleção ──
await ok("seleção: entra só comissão CONFIRMADA sem fechamento de competência <= mês; prevista, cancelada e recusada ficam fora", () => {
  const base = { fechamento_id: null, lancamento_origem_id: null, valor_comissao: 20 };
  const lancs = [
    { id: "a", tipo: "comissao", status: "confirmada", competencia: SET, ...base },
    { id: "b", tipo: "comissao", status: "prevista", competencia: SET, ...base },
    { id: "c", tipo: "comissao", status: "cancelada", competencia: SET, ...base },
    { id: "d", tipo: "comissao", status: "recusada", competencia: SET, ...base },
    { id: "e", tipo: "comissao", status: "confirmada", competencia: "2026-08-01", ...base },
    { id: "f", tipo: "comissao", status: "confirmada", competencia: OUT, ...base },
  ];
  const r = selecionarParaFechamento(lancs, SET, new Set());
  assert.deepEqual(r.comissoes.sort(), ["a", "e"]);
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.total, 40);
});
await ok("seleção: retroativo_pendente e contestada de competência <= mês BLOQUEIAM; de mês posterior não", () => {
  const base = { fechamento_id: null, lancamento_origem_id: null, valor_comissao: 20 };
  const r = selecionarParaFechamento([
    { id: "r", tipo: "comissao", status: "retroativo_pendente", competencia: SET, ...base },
    { id: "c", tipo: "comissao", status: "contestada", competencia: "2026-08-01", ...base },
    { id: "x", tipo: "comissao", status: "contestada", competencia: OUT, ...base },
  ], SET, new Set());
  assert.deepEqual(r.bloqueios.sort(), ["c", "r"]);
});
await ok("seleção: ajuste/estorno entra se o original JÁ foi fechado ou entra agora; sobre original que ainda não conta, fica de fora; total é assinado", () => {
  const base = { fechamento_id: null, valor_comissao: 20 };
  const r = selecionarParaFechamento([
    { id: "ent", tipo: "comissao", status: "confirmada", competencia: SET, lancamento_origem_id: null, ...base },
    { id: "prev", tipo: "comissao", status: "prevista", competencia: SET, lancamento_origem_id: null, ...base },
    { id: "e1", tipo: "estorno", status: "confirmada", competencia: SET, lancamento_origem_id: "ent", fechamento_id: null, valor_comissao: -5 },
    { id: "e2", tipo: "estorno", status: "confirmada", competencia: SET, lancamento_origem_id: "prev", fechamento_id: null, valor_comissao: -7 },
    { id: "e3", tipo: "ajuste", status: "confirmada", competencia: SET, lancamento_origem_id: "velho", fechamento_id: null, valor_comissao: 3 },
    { id: "e4", tipo: "estorno", status: "confirmada", competencia: OUT, lancamento_origem_id: "velho", fechamento_id: null, valor_comissao: -9 },
  ], SET, new Set(["velho"]));
  assert.deepEqual(r.ajustes.sort(), ["e1", "e3"]);
  assert.equal(r.total, 20 - 5 + 3);
});
await ok("atrasada: competência anterior ao mês do fechamento preserva a original; mesmo mês não é atrasada", () => {
  assert.equal(mesAtrasadoDe(SET, OUT), SET);
  assert.equal(mesAtrasadoDe(OUT, OUT), null);
});
await ok("fechado = congelado na regra de sincronização: valor e status não acompanham mais a cobrança", () => {
  const l = { tipo: "comissao", status: "confirmada", base_valor: 400, valor_comissao: 20, percentual_aplicado: 5, fechado_em: "2026-10-05T00:00:00Z" };
  assert.deepEqual(mudancasPorCobranca(l, { status: "cancelada", fee_valor: 999 }), {});
  assert.deepEqual(mudancasPorCobranca(l, { status: "aprovada_enviada", fee_valor: 999 }), {});
});

// ── 2) Fechamento pelas rotas ──
await ok("prévia mostra o que entra por beneficiário; fechar grava total assinado, congela os lançamentos e preserva a competência", async () => {
  const db = cenario();
  const a = lanc(db); const b = lanc(db, { beneficiario_id: BEN_REB, valor_comissao: 30 }); const prev = prevista(db);
  const p = await chamar(R.previa.GET, { url: "http://t/api?mes=2026-09" });
  assert.equal(p.status, 200);
  const u = p.corpo.unidades[0];
  assert.deepEqual([u.unidade_id, u.qtd, u.total, u.bloqueios.length], [U1, 2, 50, 0]);
  assert.deepEqual(u.grupos.map((g: any) => [g.nome, g.total, g.qtd_cobrancas]).sort(), [["Giovanni Prado", 20, 1], ["Rebecca Zambonini", 30, 1]]);
  assert.equal(db.tabelas.comissao_fechamentos.length, 0, "a prévia não grava nada");
  const r = await fechar("2026-09", { esperado_qtd: 2, esperado_total: 50 });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const f = db.tabelas.comissao_fechamentos[0];
  assert.deepEqual([f.competencia, f.unidade_id, f.total, f.qtd_lancamentos, f.fechado_por, f.pago_em], [SET, U1, 50, 2, "u-dir", null]);
  for (const l of [a, b]) assert.deepEqual([L(db, l.id).fechamento_id, !!L(db, l.id).fechado_em, L(db, l.id).competencia], [f.id, true, SET]);
  assert.equal(L(db, prev.id).fechamento_id, null, "prevista fica fora");
  assert.ok(auditoria(db).some((x: any) => x.acao === "comissao_fechamento_concluido" && x.entidade_id === f.id && x.detalhes.total === 50));
});
await ok("fechar duas vezes não duplica: devolve o mesmo fechamento (200), sem novo aviso e sem nova auditoria", async () => {
  const db = cenario(); lanc(db);
  const r1 = await fechar("2026-09"); assert.equal(r1.status, 201);
  const sinosAntes = sinos(db).length; const auditAntes = auditoria(db).filter((x: any) => x.acao === "comissao_fechamento_concluido").length;
  const r2 = await fechar("2026-09");
  assert.equal(r2.status, 200); assert.equal(r2.corpo.ja_existia, true); assert.equal(r2.corpo.fechamento_id, r1.corpo.fechamento_id);
  assert.equal(db.tabelas.comissao_fechamentos.length, 1);
  assert.equal(sinos(db).length, sinosAntes);
  assert.equal(auditoria(db).filter((x: any) => x.acao === "comissao_fechamento_concluido").length, auditAntes);
});
await ok("prévia desatualizada (algo mudou entre a prévia e o clique): aborta o fechamento INTEIRO e nada é gravado", async () => {
  const db = cenario(); lanc(db);
  const r = await fechar("2026-09", { esperado_qtd: 1, esperado_total: 20 });
  assert.equal(r.status, 201);
  const db2 = cenario(); lanc(db2); lanc(db2); // aparecem 2 depois de a prévia ter visto 1
  const r2 = await fechar("2026-09", { esperado_qtd: 1, esperado_total: 20 });
  assert.equal(r2.status, 409); assert.equal(r2.corpo.codigo, "mudou_desde_a_previa");
  assert.equal(db2.tabelas.comissao_fechamentos.length, 0);
  assert.equal(db2.tabelas.comissao_lancamentos.filter((l: any) => l.fechamento_id).length, 0);
  assert.equal(sinos(db2).length, 0);
});
await ok("bloqueio: retroativo_pendente ou contestada de competência <= mês impede fechar e a prévia lista o que bloqueia com link para resolver; resolvido, fecha", async () => {
  const db = cenario(); lanc(db);
  const retro = lanc(db, { status: "retroativo_pendente", beneficiario_id: BEN_REB });
  const cont = lanc(db, { status: "contestada", competencia: "2026-08-01" });
  const p = (await chamar(R.previa.GET, { url: "http://t/api?mes=2026-09" })).corpo.unidades[0];
  assert.deepEqual(p.bloqueios.map((b: any) => [b.id, b.status, b.link]).sort(), [[cont.id, "contestada", "/painel/comissoes?mes=2026-08"], [retro.id, "retroativo_pendente", "/painel/comissoes?mes=2026-09"]].sort());
  const r = await fechar("2026-09");
  assert.equal(r.status, 409); assert.equal(r.corpo.codigo, "bloqueado"); assert.equal(r.corpo.bloqueios.length, 2);
  assert.equal(db.tabelas.comissao_fechamentos.length, 0);
  // diretoria resolve: recusa o retroativo e mantém a contestada
  assert.equal((await chamar(R.retro.POST, { metodo: "POST", params: { id: retro.id }, corpo: { decisao: "recusar", motivo: "Já paga" } })).status, 200);
  assert.equal((await chamar(R.resolver.POST, { metodo: "POST", params: { id: cont.id }, corpo: { acao: "mantem", nota: "Conferido" } })).status, 200);
  assert.equal(L(db, cont.id).status, "confirmada");
  const r2 = await fechar("2026-09");
  assert.equal(r2.status, 201, JSON.stringify(r2.corpo));
  assert.equal(r2.corpo.qtd, 2); // a confirmada de setembro + a de agosto (atrasada), nada de recusada
});
await ok("contestada/retroativo de mês POSTERIOR não bloqueia o fechamento do mês anterior", async () => {
  const db = cenario(); lanc(db); lanc(db, { status: "contestada", competencia: OUT });
  assert.equal((await fechar("2026-09")).status, 201);
});
await ok("mês futuro e mês sem nada confirmado não fecham; mês anterior a um fechamento posterior não fecha", async () => {
  const db = cenario();
  assert.equal((await fechar("2026-11")).corpo.codigo, "mes_futuro");
  assert.equal((await fechar("2026-09")).corpo.codigo, "nada_para_fechar");
  lanc(db, { competencia: OUT }); lanc(db);
  assert.equal((await fechar("2026-10")).status, 201);
  const r = await fechar("2026-08");
  assert.equal(r.status, 409); assert.equal(r.corpo.codigo, "fechamento_posterior");
});

// ── 3) Atrasadas, congelamento e ajustes depois do fechamento ──
await ok("comissão confirmada DEPOIS do fechamento do mês dela entra no PRÓXIMO fechamento como 'atrasada de setembro' (competência original preservada); setembro não muda", async () => {
  const db = cenario();
  const cob = cobranca(db, { status: "aprovada_enviada", data_vencimento: null }); // enviada em setembro, ainda sem validar
  const prev = lanc(db, { cobranca_id: cob, status: "prevista" });
  lanc(db); // outra, confirmada, fecha setembro
  const set = await fechar("2026-09");
  assert.equal(set.corpo.qtd, 1);
  assert.equal((await chamar(R.vencimento.PATCH, { metodo: "PATCH", params: { id: cob }, corpo: { data_vencimento: "2026-11-10" } })).status, 200);
  assert.equal(L(db, prev.id).status, "confirmada", "a validação confirmou depois do fechamento de setembro");
  const out = await fechar("2026-10");
  assert.equal(out.status, 201, JSON.stringify(out.corpo));
  assert.equal(L(db, prev.id).fechamento_id, out.corpo.fechamento_id);
  assert.equal(L(db, prev.id).competencia, SET, "competência original preservada");
  const d = (await detalhe(out.corpo.fechamento_id)).corpo;
  const linha = d.grupos[0].linhas[0];
  assert.deepEqual([linha.lancamento_id, linha.atrasada_de, linha.competencia], [prev.id, SET, SET]);
  const fSet = db.tabelas.comissao_fechamentos.find((f: any) => f.competencia === SET);
  assert.deepEqual([fSet.total, fSet.qtd_lancamentos], [20, 1], "o fechamento de setembro NÃO foi alterado");
});
await ok("fechado é congelado: correção de taxa, cancelamento da cobrança e contestação não mexem em lançamento fechado; correção entra por ajuste", async () => {
  const db = cenario();
  const cob = cobranca(db); const l = lanc(db, { cobranca_id: cob });
  const f = await fechar("2026-09"); assert.equal(f.status, 201);
  const antes = structuredClone(L(db, l.id));
  assert.equal((await chamar(R.corrigirTaxa.POST, { metodo: "POST", params: { id: cob }, corpo: { fee_percentual: 50 } })).status, 200);
  assert.deepEqual(L(db, l.id), antes, "valor e status do fechado não acompanham a correção de taxa");
  assert.equal((await chamar(R.cancelar.POST, { metodo: "POST", params: { id: cob }, corpo: { justificativa: "Cliente desistiu da contratação" } })).status, 200);
  assert.deepEqual(L(db, l.id), antes, "cobrança cancelada depois do fechamento: o fechado continua confirmado");
  const c = await chamar(R.contestar.POST, { metodo: "POST", params: { id: l.id }, corpo: { motivo: "Conferir" } });
  assert.equal(c.status, 409); assert.equal(c.corpo.codigo, "lancamento_fechado");
  assert.deepEqual(L(db, l.id), antes);
  const aj = await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: l.id, tipo: "estorno", valor: 20, motivo: "Cobrança cancelada depois do fechamento" } });
  assert.equal(aj.status, 201, "ajuste sobre fechado é permitido (é o caminho de correção)");
});
await ok("ajuste/estorno feito DEPOIS do fechamento cai no fechamento seguinte (não no já fechado); o total do seguinte pode ser NEGATIVO e não bloqueia", async () => {
  const db = cenario();
  const l = lanc(db);
  const f1 = await fechar("2026-09"); assert.equal(f1.status, 201);
  const aj = await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: l.id, tipo: "estorno", valor: 8, motivo: "Cliente devolveu parte" } });
  assert.equal(aj.status, 201); assert.equal(aj.corpo.lancamento.competencia, OUT);
  assert.equal(db.tabelas.comissao_fechamentos[0].total, 20, "o fechamento de setembro continua com 20,00");
  const p = (await chamar(R.previa.GET, { url: "http://t/api?mes=2026-10" })).corpo.unidades[0];
  assert.deepEqual([p.qtd, p.total], [1, -8]);
  assert.equal(p.grupos[0].ajustes[0].comissao, -8);
  const f2 = await fechar("2026-10", { esperado_qtd: 1, esperado_total: -8 });
  assert.equal(f2.status, 201, JSON.stringify(f2.corpo));
  assert.equal(f2.corpo.total, -8);
});
await ok("totais assinados por beneficiário: comissões + estornos; zero e negativo são mostrados, sem bloquear", async () => {
  const db = cenario();
  const a = lanc(db); lanc(db, { beneficiario_id: BEN_REB, valor_comissao: 30 });
  const e1 = lanc(db, { tipo: "estorno", valor_comissao: -20, lancamento_origem_id: a.id, motivo: "devolvido", base_valor: null, percentual_aplicado: null, cobranca_id: a.cobranca_id });
  assert.ok(e1);
  const p = (await chamar(R.previa.GET, { url: "http://t/api?mes=2026-09" })).corpo.unidades[0];
  const gio = p.grupos.find((g: any) => g.nome === "Giovanni Prado");
  assert.deepEqual([gio.total, gio.qtd_cobrancas, gio.linhas.length, gio.ajustes.length], [0, 1, 1, 1], "20 − 20 = 0: aparece e não bloqueia");
  assert.equal(p.total, 30);
  assert.equal((await fechar("2026-09")).status, 201);
});

// ── 4) Pagamento ──
await ok("pagamento: só em fechamento existente, uma vez, com data (não futura); registra quem e quando; não se desfaz nem se altera", async () => {
  const db = cenario(); lanc(db);
  const f = (await fechar("2026-09")).corpo.fechamento_id;
  const pagar = (id: string, corpo: unknown) => chamar(R.pagar.POST, { metodo: "POST", params: { id }, corpo });
  assert.equal((await pagar(ID(999), { pago_em: "2026-10-06" })).status, 404, "fechamento inexistente");
  assert.equal((await pagar(f, { pago_em: "06/10/2026" })).status, 400);
  assert.equal((await pagar(f, {})).status, 400);
  const fut = await pagar(f, { pago_em: "2026-10-08" }); assert.equal(fut.status, 422); assert.equal(fut.corpo.codigo, "data_futura");
  assert.equal(db.tabelas.comissao_fechamentos[0].pago_em, null);
  const r = await pagar(f, { pago_em: "2026-10-06" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const reg = db.tabelas.comissao_fechamentos[0];
  assert.deepEqual([reg.pago_em, reg.pago_registrado_por], ["2026-10-06", "u-dir"]);
  assert.ok(reg.pago_registrado_em);
  const de_novo = await pagar(f, { pago_em: "2026-10-05" }); assert.equal(de_novo.status, 409); assert.equal(de_novo.corpo.codigo, "ja_pago");
  assert.equal(db.tabelas.comissao_fechamentos[0].pago_em, "2026-10-06", "pagamento não é alterado");
  assert.ok(auditoria(db).some((x: any) => x.acao === "comissao_fechamento_pago" && x.entidade_id === f && x.detalhes.pago_em === "2026-10-06"));
});

// ── 5) Cartões do beneficiário (a receber x pago) ──
await ok("cartões: confirmado (a fechar) -> a receber (fechado) -> pago; cada valor em UM cartão; estorno ainda não fechado abate o próximo pagamento", async () => {
  const db = cenario();
  const l = lanc(db, { competencia: OUT }); prevista(db, { competencia: OUT });
  const m = async (mes = "2026-10") => { logar(db, "gio"); const t = (await chamar(R.minhas.GET, { url: `http://t/api?mes=${mes}` })).corpo.totais; logar(db, "dir"); return t; };
  assert.deepEqual(await m(), { previsto: 20, confirmado: 20, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 0 });
  const f = (await fechar("2026-10")).corpo.fechamento_id;
  assert.deepEqual(await m(), { previsto: 20, confirmado: 0, contestado: 0, retroativoPendente: 0, aReceber: 20, pago: 0 });
  await chamar(R.pagar.POST, { metodo: "POST", params: { id: f }, corpo: { pago_em: "2026-10-06" } });
  assert.deepEqual(await m(), { previsto: 20, confirmado: 0, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 20 });
  await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: l.id, tipo: "estorno", valor: 6, motivo: "abatimento" } });
  assert.deepEqual(await m(), { previsto: 20, confirmado: -6, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 20 }, "o estorno novo espera o próximo fechamento em 'confirmado'");
  // cada linha do beneficiário mostra o fechamento e se foi pago
  logar(db, "gio");
  const linha = (await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-10" })).corpo.lancamentos.find((x: any) => x.id === l.id);
  assert.deepEqual([linha.fechamento.id, linha.fechamento.pago_em, linha.fechamento_pago], [f, "2026-10-06", true]);
  assert.equal(totalizar([{ tipo: "comissao", status: "confirmada", valor_comissao: 10, fechado_em: "x", fechamento_pago: false }, { tipo: "comissao", status: "confirmada", valor_comissao: 5 }]).aReceber, 10);
});

// ── 6) Avisos por sino ──
await ok("sino: contestação, resolução, retroativo aprovado/recusado — só ao beneficiário dono do lançamento, tipo certo, texto curto, sem e-mail", async () => {
  const db = cenario();
  const l1 = prevista(db, { competencia: OUT });
  const r1 = lanc(db, { status: "retroativo_pendente", beneficiario_id: BEN_REB }); const r2 = lanc(db, { status: "retroativo_pendente", beneficiario_id: BEN_REB, cobranca_id: cobranca(db) });
  await chamar(R.contestar.POST, { metodo: "POST", params: { id: l1.id }, corpo: { motivo: "Quem conduziu foi a Rebecca" } });
  let s = sinos(db);
  assert.deepEqual([s.length, s[0].tipo, s[0].user_id, s[0].lida], [1, "comissao_contestada", "u-gio", false]);
  assert.match(s[0].mensagem, /contestou sua comissão de R\$\s?20,00/); assert.match(s[0].mensagem, /Quem conduziu foi a Rebecca/);
  assert.ok(s[0].mensagem.length < 200);
  await chamar(R.resolver.POST, { metodo: "POST", params: { id: l1.id }, corpo: { acao: "mantem", nota: "Conferido: é do Giovanni" } });
  await chamar(R.retro.POST, { metodo: "POST", params: { id: r1.id }, corpo: { decisao: "aprovar" } });
  await chamar(R.retro.POST, { metodo: "POST", params: { id: r2.id }, corpo: { decisao: "recusar", motivo: "Já paga" } });
  s = sinos(db);
  assert.deepEqual(s.map((x: any) => [x.tipo, x.user_id]), [["comissao_contestada", "u-gio"], ["comissao_contestacao_resolvida", "u-gio"], ["comissao_retroativo_aprovado", "u-reb"], ["comissao_retroativo_recusado", "u-reb"]]);
  assert.match(s[3].mensagem, /Já paga/);
  assert.equal(sinos(db, "u-out").length, 0, "ninguém mais recebe");
  assert.equal(db.emails.length, 0, "sem e-mail");
  assert.equal(auditoria(db).filter((x: any) => x.acao === "comissao_aviso_criado").length, 4);
  for (const x of s) assert.deepEqual(Object.keys(x).filter((k) => k !== "criado_em").sort(), ["id", "lida", "mensagem", "tipo", "titulo", "user_id"].sort(), "só colunas do sino (criado_em é carimbo do harness); nenhum popup/outro canal");
});
await ok("sino de fechamento: só para os beneficiários que têm lançamento NESTE fechamento, cada um com o próprio total; o de pagamento idem", async () => {
  const db = cenario();
  lanc(db); lanc(db, { valor_comissao: 15 }); lanc(db, { beneficiario_id: BEN_REB, valor_comissao: 30 });
  db.tabelas.comissao_beneficiarios.push({ id: ID(903), analista_perfil_id: P_OUT, percentual: 5, ativo: true, unidade_id: U1 }); // beneficiária sem lançamento neste mês
  const f = (await fechar("2026-09")).corpo.fechamento_id;
  let s = sinos(db);
  assert.deepEqual(s.map((x: any) => [x.tipo, x.user_id]).sort(), [["comissao_fechamento", "u-gio"], ["comissao_fechamento", "u-reb"]].sort());
  assert.match(s.find((x: any) => x.user_id === "u-gio").mensagem, /R\$\s?35,00 \(2 lançamentos\)/);
  assert.match(s.find((x: any) => x.user_id === "u-reb").mensagem, /R\$\s?30,00 \(1 lançamento\)/);
  assert.equal(sinos(db, "u-out").length, 0);
  await chamar(R.pagar.POST, { metodo: "POST", params: { id: f }, corpo: { pago_em: "2026-10-06" } });
  s = sinos(db).filter((x: any) => x.tipo === "comissao_pagamento");
  assert.deepEqual(s.map((x: any) => x.user_id).sort(), ["u-gio", "u-reb"]);
  assert.match(s.find((x: any) => x.user_id === "u-gio").mensagem, /06\/10\/2026/);
  assert.equal(db.emails.length, 0);
});
await ok("o sino leva a Minhas comissões (link tratado no NotificacoesProvider para os tipos comissao_*)", () => {
  const fonte = fs.readFileSync("src/components/NotificacoesProvider.tsx", "utf8");
  assert.ok(/n\.tipo\.startsWith\("comissao_"\)\) router\.push\("\/painel\/minhas-comissoes"\)/.test(fonte));
});

// ── 7) CSV, acesso e unidades ──
await ok("CSV tem as MESMAS linhas da tela (comissões e ajustes, por beneficiário), valores assinados, atrasadas marcadas, TOTAL por beneficiário, BOM e ';'", async () => {
  const db = cenario();
  const a = lanc(db, { competencia: "2026-08-01" }); lanc(db, { beneficiario_id: BEN_REB, valor_comissao: 30 });
  lanc(db, { tipo: "estorno", valor_comissao: -5, lancamento_origem_id: a.id, motivo: "devolveu; parte \"X\"", base_valor: null, percentual_aplicado: null, cobranca_id: a.cobranca_id });
  const f = (await fechar("2026-09")).corpo.fechamento_id;
  const tela = (await detalhe(f)).corpo.grupos;
  const resp = await chamar(R.csv.GET, { params: { id: f } });
  void resp;
  const res = await R.csv.GET(new Request("http://t/api"), { params: Promise.resolve({ id: f }) });
  assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(res.headers.get("content-disposition") ?? "", /comissoes-2026-09-monte-mor-hortolandia\.csv/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM UTF-8 para o Excel");
  const bruto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  assert.ok(bruto.startsWith("\uFEFFBeneficiário;Tipo;Cliente;Vaga;Competência;Atrasada de;Fee (R$);Comissão (R$);Motivo\r\n"));
  const linhas = bruto.replace("﻿", "").trim().split("\r\n").slice(1);
  const dados = linhas.filter((l) => !l.includes(";TOTAL;"));
  const totais = linhas.filter((l) => l.includes(";TOTAL;"));
  const nLinhasTela = tela.reduce((s: number, g: any) => s + g.linhas.length + g.ajustes.length, 0);
  assert.equal(dados.length, nLinhasTela);
  assert.equal(totais.length, tela.length);
  assert.ok(dados.some((l) => l.includes(";Estorno;") && l.includes(";-5,00;")), "estorno negativo");
  assert.ok(dados.some((l) => l.includes(";08/2026;08/2026;")), "atrasada de agosto marcada");
  assert.ok(dados.some((l) => l.includes('"devolveu; parte ""X"""')), "escape de ; e aspas");
  assert.ok(totais.some((l) => l.startsWith("Giovanni Prado;TOTAL;") && l.includes(";15,00;")), "20 − 5 = 15");
  assert.equal(montarCsvFolha([{ beneficiario: "=CMD()", tipo: "Comissão", cliente: "@x", vaga: "+1", competencia: SET, atrasadaDe: null, fee: 1, comissao: 1, motivo: null }]).includes(";=CMD()"), false, "texto livre não vira fórmula");
});
await ok("acesso: beneficiário e analista comum não fecham, não pagam, não baixam CSV nem veem fechamento; anônimo recebe 401", async () => {
  const db = cenario(); lanc(db);
  const f = (await fechar("2026-09")).corpo.fechamento_id;
  for (const quem of ["gio", "outra"]) {
    logar(db, quem);
    assert.equal((await chamar(R.fechamentos.GET)).status, 403);
    assert.equal((await fechar("2026-09")).status, 403);
    assert.equal((await chamar(R.previa.GET)).status, 403);
    assert.equal((await detalhe(f)).status, 403);
    assert.equal((await chamar(R.csv.GET, { params: { id: f } })).status, 403);
    assert.equal((await chamar(R.pagar.POST, { metodo: "POST", params: { id: f }, corpo: { pago_em: "2026-10-06" } })).status, 403);
  }
  logar(db, null);
  assert.equal((await fechar("2026-09")).status, 401);
  assert.equal(db.tabelas.comissao_fechamentos[0].pago_em, null);
});
await ok("beneficiário só vê o que é seu: a lista dele traz o fechamento só dos próprios lançamentos, não os de outro", async () => {
  const db = cenario();
  const meu = lanc(db); const doutro = lanc(db, { beneficiario_id: BEN_REB, valor_comissao: 30 });
  const f = (await fechar("2026-09")).corpo.fechamento_id;
  logar(db, "gio");
  const m = (await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-09" })).corpo;
  assert.deepEqual(m.lancamentos.map((x: any) => x.id), [meu.id]);
  assert.equal(m.lancamentos[0].fechamento.id, f);
  assert.equal(JSON.stringify(m).includes(doutro.id), false);
  assert.equal(JSON.stringify(m).includes("Rebecca"), false);
});
await ok("unidades: fechar é por unidade; quem só enxerga a própria unidade não fecha outra (404) nem vê o fechamento de outra", async () => {
  const db = cenario(); lanc(db);
  lanc(db, { unidade_id: U2, cobranca_id: cobranca(db, { unidade_id: U2 }) });
  db.tabelas.usuario_acesso_customizado = [{ id: "x1", analista_perfil_id: P_OUT, chave_aba: "comissoes", liberado: true }];
  const f1 = (await fechar("2026-09")).corpo.fechamento_id;
  logar(db, "outra"); // analista da U1 com a exceção de aba "comissoes": enxerga só a U1
  const r = await chamar(R.fechamentos.POST, { metodo: "POST", corpo: { competencia: "2026-09", unidade_id: U2 } });
  assert.equal(r.status, 404);
  assert.equal((await detalhe(f1)).status, 200);
  logar(db, "dir");
  const f2 = (await chamar(R.fechamentos.POST, { metodo: "POST", corpo: { competencia: "2026-09", unidade_id: U2 } })).corpo.fechamento_id;
  logar(db, "outra");
  assert.equal((await detalhe(f2)).status, 404, "fechamento de outra unidade = inexistente");
  assert.deepEqual((await chamar(R.fechamentos.GET)).corpo.fechamentos.map((f: any) => f.unidade_id), [U1]);
});
await ok("unidade inexistente é recusada com 404 claro (nada gravado); retroativo ANTIGO de mês já fechado continua bloqueando o fechamento seguinte e a prévia mostra o link para resolver", async () => {
  const db = cenario(); lanc(db, { competencia: "2026-08-01" });
  const r = await chamar(R.fechamentos.POST, { metodo: "POST", corpo: { competencia: "2026-09", unidade_id: ID(777) } });
  assert.equal(r.status, 404); assert.equal(r.corpo.codigo, "unidade_invalida");
  assert.equal(db.tabelas.comissao_fechamentos.length, 0);
  assert.equal((await fechar("2026-08")).status, 201, "agosto fechado");
  // agosto já está fechado; depois alguém marca uma cobrança de agosto: nasce retroativo_pendente com competência de agosto
  const velho = lanc(db, { status: "retroativo_pendente", competencia: "2026-08-01", beneficiario_id: BEN_REB });
  lanc(db); // setembro confirmada
  const p = (await chamar(R.previa.GET, { url: "http://t/api?mes=2026-09" })).corpo.unidades[0];
  assert.deepEqual(p.bloqueios.map((b: any) => [b.id, b.status, b.competencia, b.link]), [[velho.id, "retroativo_pendente", "2026-08-01", "/painel/comissoes?mes=2026-08"]]);
  const bloqueado = await fechar("2026-09");
  assert.equal(bloqueado.status, 409); assert.equal(bloqueado.corpo.codigo, "bloqueado");
  // a tela do mês de agosto mostra o pedido com os botões de decisão (é para onde o link leva)
  const ago = (await chamar(R.todas.GET, { url: "http://t/api?mes=2026-08" })).corpo;
  assert.ok(ago.lancamentos.some((l: any) => l.id === velho.id) && ago.retroativosPendentes.some((l: any) => l.id === velho.id));
  await chamar(R.retro.POST, { metodo: "POST", params: { id: velho.id }, corpo: { decisao: "recusar", motivo: "Já paga" } });
  assert.equal((await fechar("2026-09")).status, 201, "resolvido, o fechamento de setembro passa");
});
await ok("a regra do banco existe na migração: lançamento fechado congelado, fechamento nunca apagado, pagamento uma vez, função só para service_role", () => {
  const sql = fs.readFileSync("supabase/migration_comissao_fase2.sql", "utf8");
  for (const trecho of ["lançamento fechado não pode ser alterado", "fechamento não pode ser apagado", "pagamento já registrado não pode ser desfeito", "GRANT EXECUTE ON FUNCTION public.comissao_fechar_mes", "FROM PUBLIC, anon, authenticated", "SET search_path = ''", "unidade_invalida", "pg_advisory_xact_lock", "FOR UPDATE", "mudou_desde_a_previa"]) {
    assert.ok(sql.includes(trecho), trecho);
  }
});

// ── 8) Prazo de lançamento: o mês M só fecha a partir do dia 4 do mês seguinte (a regra está na aplicação; a função SQL não muda) ──
const emData = async <T,>(iso: string, fn: () => Promise<T>): Promise<T> => { congelarData(iso); try { return await fn(); } finally { congelarData(); } };
const fecharNaData = (iso: string, mes: string, extra: Record<string, unknown> = {}) => emData(iso, () => chamar(R.fechamentos.POST, { metodo: "POST", corpo: { competencia: mes, unidade_id: U1, ...extra } }));
const previaNaData = (iso: string, mes: string) => emData(iso, async () => (await chamar(R.previa.GET, { url: `http://t/api?mes=${mes}` })).corpo.unidades[0]);
const DIA3_2359 = "2026-11-04T02:59:00Z", DIA4_0000 = "2026-11-04T03:00:00Z";

await ok("fechar outubro no dia 3 (23:59 BRT) => 409 prazo_de_lancamento, nada gravado; a prévia funciona e avisa; no dia 4 (00:00 BRT) fecha com a prévia batendo", async () => {
  const db = cenario(); lanc(db, { competencia: OUT });
  const r = await fecharNaData(DIA3_2359, "2026-10");
  assert.deepEqual([r.status, r.corpo.codigo, r.corpo.fechavel_a_partir_de], [409, "prazo_de_lancamento", "2026-11-04"]);
  assert.equal(db.tabelas.comissao_fechamentos.length, 0);
  assert.equal(db.tabelas.comissao_lancamentos.some((l: any) => l.fechamento_id), false);
  const antes = await previaNaData(DIA3_2359, "2026-10");
  assert.deepEqual([antes.qtd, antes.total, antes.prazo_de_lancamento_aberto, antes.fechavel_a_partir_de], [1, 20, true, "2026-11-04"]);
  assert.equal((await fecharNaData(DIA4_0000, "2026-10")).status === 201, true, "dia 4 às 00:00 BRT já fecha");
});
await ok("dia 4: a prévia bate com o fechamento (esperado_qtd/esperado_total) e a prévia deixa de avisar", async () => {
  const db = cenario(); lanc(db, { competencia: OUT }); lanc(db, { competencia: OUT, valor_comissao: 30 });
  const p = await previaNaData(DIA4_0000, "2026-10");
  assert.deepEqual([p.qtd, p.total, p.prazo_de_lancamento_aberto], [2, 50, false]);
  const r = await fecharNaData(DIA4_0000, "2026-10", { esperado_qtd: p.qtd, esperado_total: p.total });
  assert.deepEqual([r.status, r.corpo.qtd, r.corpo.total], [201, 2, 50]);
});
await ok("mês corrente e mês futuro continuam sem fechar (409 prazo_de_lancamento / 422 mes_futuro); setembro fecha no dia 4/10 e não antes", async () => {
  const db = cenario(); lanc(db); lanc(db, { competencia: OUT });
  assert.equal((await fecharNaData("2026-11-10T15:00:00Z", "2026-11")).corpo.codigo, "prazo_de_lancamento", "mês corrente");
  assert.equal((await fecharNaData("2026-11-10T15:00:00Z", "2026-12")).corpo.codigo, "mes_futuro");
  assert.equal((await fecharNaData("2026-10-03T14:59:00Z", "2026-09")).corpo.codigo, "prazo_de_lancamento", "03/10 11:59 BRT");
  assert.equal((await fecharNaData("2026-10-04T15:00:00Z", "2026-09")).status, 201);
});
await ok("virada de ano: dezembro só fecha a partir de 04/01", async () => {
  const db = cenario(); lanc(db, { competencia: "2026-12-01" });
  assert.equal(fechamentoLiberadoEm("2026-12-01"), "2027-01-04");
  assert.equal((await fecharNaData("2027-01-03T20:00:00Z", "2026-12")).corpo.codigo, "prazo_de_lancamento");
  assert.equal((await fecharNaData("2027-01-04T03:00:00Z", "2026-12")).status, 201);
});
await ok("marcação feita na folga (competência outubro, marcada em 02/11) entra no fechamento de OUTUBRO, fechado no dia 4", async () => {
  const db = cenario();
  const dentro = lanc(db, { competencia: OUT });
  const cobF = cobranca(db, { enviado_em: "2026-10-31T20:30:00Z", status: "validada" });
  await emData("2026-11-02T15:00:00Z", async () => { logar(db, "gio"); const r = await chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id: cobF, motivo: "Aceite na segunda" } }); assert.equal(r.status, 201, JSON.stringify(r.corpo)); logar(db, "dir"); });
  const folga = db.tabelas.comissao_lancamentos.find((l: any) => l.cobranca_id === cobF);
  assert.deepEqual([folga.competencia, folga.status, folga.motivo], [OUT, "confirmada", "Aceite na segunda"]);
  const p = await previaNaData(DIA4_0000, "2026-10");
  assert.deepEqual([p.qtd, p.total], [2, 40]);
  const r = await fecharNaData(DIA4_0000, "2026-10", { esperado_qtd: p.qtd, esperado_total: p.total });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.deepEqual([L(db, folga.id).fechamento_id, L(db, dentro.id).fechamento_id].map((x: any) => x === r.corpo.fechamento_id), [true, true]);
  assert.equal(r.corpo.total, 40);
});
await ok("mês de competência JÁ fechado antes (fechamento feito pela regra antiga): marcar na folga não quebra nada — o lançamento fica aberto, com a competência original, e entra no fechamento seguinte como 'atrasada de outubro'", async () => {
  const db = cenario(); lanc(db, { competencia: OUT });
  assert.equal((await fecharNaData("2026-11-10T15:00:00Z", "2026-10")).status, 201); // simula o outubro já fechado
  const cobF = cobranca(db, { enviado_em: "2026-10-31T20:30:00Z", status: "validada" });
  await emData("2026-11-02T15:00:00Z", async () => { logar(db, "gio"); assert.equal((await chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id: cobF } })).status, 201); logar(db, "dir"); });
  const folga = db.tabelas.comissao_lancamentos.find((l: any) => l.cobranca_id === cobF);
  assert.equal(folga.competencia, OUT); assert.ok(!folga.fechamento_id, "fica aberto");
  const r = await fecharNaData("2026-12-04T15:00:00Z", "2026-11");
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.equal(L(db, folga.id).fechamento_id, r.corpo.fechamento_id);
  assert.equal(L(db, folga.id).competencia, OUT, "competência original preservada");
});
await ok("tela do fechamento: botão desabilitado dentro do prazo, com o texto 'Disponível a partir de 04/<mês seguinte>, depois do prazo de lançamento'", () => {
  const t = fs.readFileSync("src/components/comissao/FechamentoComissoes.tsx", "utf8");
  for (const x of ["u.prazo_de_lancamento_aberto ||", "Disponível a partir de", "depois do prazo de lançamento"]) assert.ok(t.includes(x), x);
});

console.log(`\n${n} verificações OK`);
