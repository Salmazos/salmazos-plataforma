// Comissão de analistas — FASE 1 (marcação, visão do analista, visão da diretoria). O projeto não tem runner de testes: as rotas e o
// serviço rodam contra o banco em memória do harness. O que depende do Postgres de verdade (trigger de imutabilidade, índices únicos,
// CHECKs) está em scripts/verificar-comissao-fase1-banco.sh.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-comissao-fase1.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, importar, chamar, auditoria, novoDb, usuario, USUARIOS } from "./harness-mot/ambiente.mjs";
import {
  calcularComissao, competenciaDoInstante, competenciaAtual, statusInicialDaMarcacao, statusPelaCobranca, mudancasPorCobranca, totalizar, competenciaDoMes,
} from "../src/lib/comissaoRegras";

congelarData(); // 07/10/2026 15:00Z => competência corrente 2026-10-01
const R = {
  marcar: await importar("src/app/api/comissoes/marcar/route.ts"),
  desmarcar: await importar("src/app/api/comissoes/desmarcar/route.ts"),
  minhas: await importar("src/app/api/comissoes/minhas/route.ts"),
  paraMarcar: await importar("src/app/api/comissoes/para-marcar/route.ts"),
  auth: await importar("src/lib/comissaoAuth.ts"),
  daCobranca: await importar("src/app/api/comissoes/cobranca/[id]/route.ts"),
  todas: await importar("src/app/api/comissoes/route.ts"),
  contestar: await importar("src/app/api/comissoes/[id]/contestar/route.ts"),
  retro: await importar("src/app/api/comissoes/[id]/retroativo/route.ts"),
  resolver: await importar("src/app/api/comissoes/[id]/resolver-contestacao/route.ts"),
  ajuste: await importar("src/app/api/comissoes/ajuste/route.ts"),
  beneficiarios: await importar("src/app/api/comissoes/beneficiarios/route.ts"),
  vencimento: await importar("src/app/api/cobrancas-rs/[id]/vencimento/route.ts"),
  corrigirTaxa: await importar("src/app/api/cobrancas-rs/[id]/corrigir-taxa/route.ts"),
  cancelar: await importar("src/app/api/cobrancas-rs/[id]/cancelar/route.ts"),
  marcarPaga: await importar("src/app/api/cobrancas-rs/[id]/marcar-paga/route.ts"),
};

let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

// Usuários: Giovanni e Rebecca são beneficiárias (analistas); Outra não é; diretoria = USUARIOS.dir.
USUARIOS.gio = usuario("u-gio", "analista");
USUARIOS.reb = usuario("u-reb", "analista");
USUARIOS.outra = usuario("u-out", "analista");

const ID = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BEN_GIO = ID(901), BEN_REB = ID(902);
const P_GIO = ID(951), P_REB = ID(952), P_OUT = ID(953); // analistas_perfil.id (UUID: o schema da rota valida)
const V_NORMAL = ID(801), V_REPOSICAO = ID(802);
let seq = 100;

interface Cob { id?: string; status?: string; tipo?: string; salario?: number; fee_percentual?: number; fee_valor?: number | null; enviado_em?: string | null; vaga_id?: string; gerado_por_user_id?: string | null; data_vencimento?: string | null; [k: string]: unknown }

function cenario() {
  const db = novoDb(); logar(db, "gio");
  const perfil = (u: string, nome: string, id: string) => ({ id, user_id: u, unidade_id: "U1", acesso_todas_unidades: false, ativo: true, nome_completo: nome, nivel_acesso: "analista" });
  db.tabelas.analistas_perfil.push(perfil("u-gio", "Giovanni Prado", P_GIO), perfil("u-reb", "Rebecca Zambonini", P_REB), perfil("u-out", "Outra Analista", P_OUT));
  db.tabelas.comissao_beneficiarios = [
    { id: BEN_GIO, analista_perfil_id: P_GIO, percentual: 5, ativo: true, unidade_id: "U1" },
    { id: BEN_REB, analista_perfil_id: P_REB, percentual: 5, ativo: true, unidade_id: "U1" },
  ];
  db.tabelas.comissao_lancamentos = [];
  db.tabelas.cobranca_rs_analistas_acesso = [{ id: "acc1", analista_perfil_id: P_GIO, ativo: true }, { id: "acc2", analista_perfil_id: P_REB, ativo: true }];
  db.tabelas.vagas = [
    { id: V_NORMAL, titulo: "Analista Fiscal", responsavel: "Rebecca", unidade_id: "U1", reposicao_de_candidato_vaga_id: null },
    { id: V_REPOSICAO, titulo: "Reposição Fiscal", responsavel: "Giovanni", unidade_id: "U1", reposicao_de_candidato_vaga_id: ID(700) },
  ];
  db.tabelas.cobrancas_rs = [];
  db.tabelas.contas_receber_hortolandia = [];
  db.tabelas.candidatos_vagas = [];
  db.tabelas.audit_logs = [];
  return db;
}
function cobranca(db: any, extra: Cob = {}): string {
  const id = extra.id ?? ID(++seq);
  db.tabelas.cobrancas_rs.push({
    id, tipo: "contratacao", status: "aprovada_enviada", salario: 1000, fee_percentual: 40, fee_valor: 400, vaga_id: V_NORMAL,
    enviado_em: "2026-10-05T15:00:00.000Z", gerado_por_user_id: "u-reb", data_vencimento: null, unidade_id: "U1", revisado_por: "u-dir",
    cliente_nome_snapshot: "Cliente Um", candidato_nome_snapshot: "Joao", cargo: "Fiscal", ...extra,
  });
  return id;
}
const marcar = (cobranca_id: string) => chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id } });
const lancs = (db: any, filtro: (l: any) => boolean = () => true) => db.tabelas.comissao_lancamentos.filter(filtro);
const doCob = (db: any, cobId: string) => lancs(db, (l) => l.cobranca_id === cobId);
// Retroativo que JÁ existia (criado antes da regra "beneficiário só marca o mês corrente"): o beneficiário não consegue mais criar um
// pela tela, então os casos de decisão da diretoria partem de um lançamento semeado direto no banco.
function retroativoExistente(db: any, cobId: string, extra: Record<string, unknown> = {}): any {
  const l = { id: ID(++seq), cobranca_id: cobId, beneficiario_id: BEN_GIO, tipo: "comissao", status: "retroativo_pendente", competencia: "2026-09-01", base_valor: 400, percentual_aplicado: 5, valor_comissao: 20, lancamento_origem_id: null, motivo: null, marcado_por: "u-gio", unidade_id: "U1", fechado_em: null, fechamento_id: null, marcado_em: "2026-10-01T12:00:00.000Z", ...extra };
  db.tabelas.comissao_lancamentos.push(l);
  return l;
}
const vencimento = (cobId: string, data: string | null) => chamar(R.vencimento.PATCH, { metodo: "PATCH", params: { id: cobId }, corpo: { data_vencimento: data } });

// ── 1) Regras puras ──
await ok("cálculo: 5% do fee BRUTO (salário 1000 × 40% = 400 → 20,00); percentual é do beneficiário; arredondamento em centavos", () => {
  assert.equal(calcularComissao(400, 5), 20);
  assert.equal(calcularComissao(400, 7.5), 30);
  assert.equal(calcularComissao(229.68, 5), 11.48);
  assert.equal(calcularComissao(0.1, 5), 0.01);
  assert.equal(calcularComissao(400, 0), 0);
});
await ok("competência: mês de Brasília (envio dia 31 às 23:30 BRT conta em outubro, mesmo já sendo novembro em UTC)", () => {
  assert.equal(competenciaDoInstante("2026-10-31T23:30:00-03:00"), "2026-10-01");
  assert.equal(new Date("2026-10-31T23:30:00-03:00").toISOString(), "2026-11-01T02:30:00.000Z");
  assert.equal(competenciaDoInstante("2026-11-01T01:00:00-03:00"), "2026-11-01");
  assert.equal(competenciaDoInstante("2026-11-01T02:59:59.000Z"), "2026-10-01"); // 23:59:59 do dia 31 em Brasília
  assert.equal(competenciaDoInstante("2026-11-01T03:00:00.000Z"), "2026-11-01"); // 00:00 do dia 1º em Brasília
  assert.equal(competenciaAtual(), "2026-10-01");
  assert.equal(competenciaDoMes("2026-10"), "2026-10-01");
  assert.equal(competenciaDoMes("2026-13"), null);
});
await ok("status pela cobrança: enviada=prevista, validada=confirmada, paga=confirmada, cancelada=cancelada; cancelamento só confirma ao pagar", () => {
  assert.equal(statusPelaCobranca({ status: "aprovada_enviada" }), "prevista");
  assert.equal(statusPelaCobranca({ status: "validada" }), "confirmada");
  assert.equal(statusPelaCobranca({ status: "paga" }), "confirmada");
  assert.equal(statusPelaCobranca({ status: "cancelada" }), "cancelada");
  assert.equal(statusPelaCobranca({ status: "pendente_revisao" }), null);
  assert.equal(statusPelaCobranca({ status: "validada", tipo: "cancelamento" }), "prevista");
  assert.equal(statusPelaCobranca({ status: "paga", tipo: "cancelamento" }), "confirmada");
});
await ok("status inicial: mês corrente = prevista/confirmada; mês passado = retroativo_pendente (qualquer status da cobrança)", () => {
  assert.deepEqual(statusInicialDaMarcacao({ status: "aprovada_enviada", enviado_em: "2026-10-02T12:00:00Z" }), { competencia: "2026-10-01", status: "prevista" });
  assert.deepEqual(statusInicialDaMarcacao({ status: "validada", enviado_em: "2026-10-02T12:00:00Z" }), { competencia: "2026-10-01", status: "confirmada" });
  assert.deepEqual(statusInicialDaMarcacao({ status: "paga", enviado_em: "2026-09-30T23:00:00-03:00" }), { competencia: "2026-09-01", status: "retroativo_pendente" });
});
await ok("mudancasPorCobranca: valor acompanha fee_valor com o percentual JÁ aplicado; fechado não muda; ajuste/estorno e terminal nunca mudam", () => {
  const base = { tipo: "comissao", status: "prevista", base_valor: 400, valor_comissao: 20, percentual_aplicado: 5, fechado_em: null };
  assert.deepEqual(mudancasPorCobranca(base, { status: "aprovada_enviada", fee_valor: 500 }), { base_valor: 500, valor_comissao: 25 });
  assert.deepEqual(mudancasPorCobranca(base, { status: "aprovada_enviada", fee_valor: 400 }), {});
  assert.deepEqual(mudancasPorCobranca({ ...base, fechado_em: "2026-10-31" }, { status: "aprovada_enviada", fee_valor: 500 }), {});
  assert.deepEqual(mudancasPorCobranca({ ...base, tipo: "estorno" }, { status: "cancelada", fee_valor: 1 }), {});
  assert.deepEqual(mudancasPorCobranca({ ...base, status: "cancelada" }, { status: "validada", fee_valor: 1 }), {});
  assert.deepEqual(mudancasPorCobranca({ ...base, status: "contestada" }, { status: "validada", fee_valor: 400 }), {}); // contestada não muda de status sozinha
  assert.deepEqual(mudancasPorCobranca({ ...base, status: "contestada" }, { status: "cancelada", fee_valor: 400 }), { status: "cancelada" });
});

// ── 2) Marcação ──
await ok("marcar: grava 5% do fee bruto (20,00), percentual aplicado, competência do envio, status prevista e audita", async () => {
  const db = cenario(); const c = cobranca(db);
  const r = await marcar(c);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  const l = doCob(db, c)[0];
  assert.deepEqual([l.beneficiario_id, l.tipo, l.status, l.competencia, l.base_valor, l.percentual_aplicado, l.valor_comissao], [BEN_GIO, "comissao", "prevista", "2026-10-01", 400, 5, 20]);
  assert.equal(l.marcado_por, "u-gio");
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_marcada" && a.entidade_id === l.id && a.detalhes.valor_comissao === 20));
});
await ok("percentual é configurável por beneficiário (não fixo): Rebecca a 7,5% => 30,00; Giovanni segue a 5%", async () => {
  const db = cenario(); const c = cobranca(db);
  db.tabelas.comissao_beneficiarios.find((b: any) => b.id === BEN_REB).percentual = 7.5;
  logar(db, "reb");
  assert.equal((await marcar(c)).status, 201);
  assert.equal(doCob(db, c)[0].valor_comissao, 30);
  assert.equal(doCob(db, c)[0].percentual_aplicado, 7.5);
});
await ok("marcação dupla bloqueada: o mesmo beneficiário (409) e outro beneficiário na mesma cobrança (409)", async () => {
  const db = cenario(); const c = cobranca(db);
  assert.equal((await marcar(c)).status, 201);
  const r2 = await marcar(c);
  assert.equal(r2.status, 409); assert.equal(r2.corpo.codigo, "marcacao_dupla");
  logar(db, "reb");
  const r3 = await marcar(c);
  assert.equal(r3.status, 409); assert.match(r3.corpo.error, /outro beneficiário/);
  assert.equal(doCob(db, c).length, 1);
});
await ok("a marcação é explícita: o responsável da vaga NÃO ganha comissão sozinho; só a sugestão visual aparece", async () => {
  const db = cenario(); const c = cobranca(db); // vaga.responsavel = Rebecca
  logar(db, "reb");
  const e = await chamar(R.daCobranca.GET, { params: { id: c } });
  assert.equal(e.status, 200);
  assert.equal(e.corpo.sugestao_responsavel_da_vaga, true);
  assert.equal(e.corpo.lancamento, null);
  assert.equal(lancs(db).length, 0, "nada é criado sem a marcação");
  logar(db, "gio");
  assert.equal((await chamar(R.daCobranca.GET, { params: { id: c } })).corpo.sugestao_responsavel_da_vaga, false);
  assert.equal((await marcar(c)).status, 201); // Giovanni marca mesmo sem ser o responsável
});
await ok("recusa: cobrança em revisão, cancelada, sem envio, sem fee e REPOSIÇÃO POR GARANTIA não geram comissão", async () => {
  const db = cenario();
  const casos: [Cob, RegExp][] = [
    [{ status: "pendente_revisao" }, /enviada para validação/],
    [{ status: "cancelada" }, /cancelada/],
    [{ enviado_em: null }, /data de envio/],
    [{ fee_valor: null }, /fee/],
    [{ vaga_id: V_REPOSICAO }, /Reposição por garantia/],
  ];
  for (const [extra, msg] of casos) {
    const r = await marcar(cobranca(db, extra));
    assert.equal(r.status, 422, JSON.stringify([extra, r.corpo]));
    assert.match(r.corpo.error, msg);
  }
  assert.equal(lancs(db).length, 0);
});
await ok("beneficiário SEM acesso a Cobranças R&S marca a cobrança gerada por OUTRO analista (a autorização é só ser beneficiário ativo)", async () => {
  const db = cenario(); const c = cobranca(db, { gerado_por_user_id: "u-reb" }); // Rebecca gerou; comissão será do Giovanni
  db.tabelas.cobranca_rs_analistas_acesso = []; // Giovanni NÃO tem acesso amplo à tela de cobranças
  const r = await marcar(c);
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  assert.deepEqual([doCob(db, c)[0].beneficiario_id, doCob(db, c)[0].valor_comissao], [BEN_GIO, 20]);
  const c2 = cobranca(db, { gerado_por_user_id: "u-out" });
  assert.equal((await marcar(c2)).status, 201, "vale para qualquer cobrança elegível, de qualquer gerador");
});
await ok("quem não é beneficiário não marca nem vê nada (403)", async () => {
  const db = cenario(); const c = cobranca(db);
  logar(db, "outra");
  assert.equal((await marcar(c)).status, 403);
  assert.equal((await chamar(R.minhas.GET)).status, 403);
  assert.equal((await chamar(R.paraMarcar.GET)).status, 403);
  assert.equal((await chamar(R.daCobranca.GET, { params: { id: c } })).status, 403);
  logar(db, null);
  assert.equal((await marcar(c)).status, 401);
});
await ok("beneficiário inativo perde o acesso", async () => {
  const db = cenario(); const c = cobranca(db);
  db.tabelas.comissao_beneficiarios.find((b: any) => b.id === BEN_GIO).ativo = false;
  assert.equal((await marcar(c)).status, 403);
});

// ── 3) Ciclo prevista -> confirmada (validação da diretoria), pagamento e cancelamento ──
await ok("validar (diretoria define o vencimento): prevista -> confirmada, validada_em gravada; apagar o vencimento volta a prevista", async () => {
  const db = cenario(); const c = cobranca(db);
  await marcar(c); logar(db, "dir");
  assert.equal((await vencimento(c, "2026-11-10")).status, 200);
  assert.equal(doCob(db, c)[0].status, "confirmada");
  const cob = db.tabelas.cobrancas_rs.find((x: any) => x.id === c);
  assert.equal(cob.status, "validada");
  assert.ok(cob.validada_em, "validada_em gravada na transição");
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_status_sincronizado" && a.detalhes.depois.status === "confirmada"));
  assert.equal((await vencimento(c, null)).status, 200);
  assert.equal(doCob(db, c)[0].status, "prevista");
  assert.equal(db.tabelas.cobrancas_rs.find((x: any) => x.id === c).validada_em, null);
});
await ok("cobrança de CANCELAMENTO (taxa de cancelamento): validada continua prevista; só confirma quando é paga", async () => {
  const db = cenario(); const c = cobranca(db, { tipo: "cancelamento", status: "validada", data_vencimento: "2026-11-10" });
  await marcar(c);
  assert.equal(doCob(db, c)[0].status, "prevista");
  logar(db, "dir");
  const paga = await chamar(R.marcarPaga.POST, { metodo: "POST", params: { id: c } });
  assert.equal(paga.status, 200, JSON.stringify(paga.corpo));
  assert.equal(doCob(db, c)[0].status, "confirmada");
});
await ok("cobrança cancelada antes de paga: o lançamento vira 'cancelada' (nunca é apagado) e sai dos totais", async () => {
  const db = cenario(); const c = cobranca(db);
  await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  const r = await chamar(R.cancelar.POST, { metodo: "POST", params: { id: c }, corpo: { justificativa: "Cliente desistiu da contratação" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(doCob(db, c).length, 1, "o lançamento continua existindo");
  assert.equal(doCob(db, c)[0].id, id);
  assert.equal(doCob(db, c)[0].status, "cancelada");
  logar(db, "gio");
  assert.deepEqual((await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-10" })).corpo.totais, { previsto: 0, confirmado: 0, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 0 });
});
await ok("correção de taxa: a comissão não fechada acompanha o fee_valor atual (40% -> 50% = 500 => 25,00); fechada não muda", async () => {
  const db = cenario(); const c = cobranca(db); const c2 = cobranca(db);
  await marcar(c); logar(db, "reb"); await marcar(c2); logar(db, "dir");
  db.tabelas.comissao_lancamentos.find((l: any) => l.cobranca_id === c2).fechado_em = "2026-10-06T00:00:00Z"; // simula fechamento da Fase 2
  const r = await chamar(R.corrigirTaxa.POST, { metodo: "POST", params: { id: c }, corpo: { fee_percentual: 50 } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const l = doCob(db, c)[0];
  assert.deepEqual([l.base_valor, l.valor_comissao, l.percentual_aplicado], [500, 25, 5]);
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_valor_sincronizado" && a.detalhes.antes.valor_comissao === 20 && a.detalhes.depois.valor_comissao === 25), "mudança de valor auditada com antes/depois");
  const r2 = await chamar(R.corrigirTaxa.POST, { metodo: "POST", params: { id: c2 }, corpo: { fee_percentual: 50 } });
  assert.equal(r2.status, 200);
  assert.equal(doCob(db, c2)[0].valor_comissao, 20, "lançamento fechado não acompanha");
});
await ok("sincronização nunca derruba a rota da cobrança: sem as tabelas de comissão (migração não aplicada) a correção de taxa e a validação seguem 200", async () => {
  const db = cenario(); const c = cobranca(db);
  delete db.tabelas.comissao_lancamentos; delete db.tabelas.comissao_beneficiarios; logar(db, "dir");
  assert.equal((await chamar(R.corrigirTaxa.POST, { metodo: "POST", params: { id: c }, corpo: { fee_percentual: 50 } })).status, 200);
  assert.equal((await vencimento(c, "2026-11-10")).status, 200);
});

// ── 4) Competência e retroativo ──
await ok("envio no dia 31 às 23:30 (Brasília) cai no mês do dia 31", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-10-31T23:30:00-03:00" });
  assert.equal((await marcar(c)).status, 201);
  assert.equal(doCob(db, c)[0].competencia, "2026-10-01");
  assert.equal(doCob(db, c)[0].status, "prevista");
});
await ok("beneficiário marca cobrança de MÊS PASSADO: 409 mes_encerrado, mensagem curta e NENHUM lançamento criado (nem retroativo_pendente)", async () => {
  const db = cenario();
  for (const st of ["aprovada_enviada", "validada", "paga"]) {
    const c = cobranca(db, { enviado_em: "2026-09-20T15:00:00.000Z", status: st, data_vencimento: "2026-10-30" });
    const r = await marcar(c);
    assert.deepEqual([r.status, r.corpo.codigo, r.corpo.error], [409, "mes_encerrado", "Só dá para marcar comissão do mês corrente. Fale com a diretoria."], st);
  }
  assert.equal(lancs(db).length, 0);
  assert.equal(auditoria(db).some((a: any) => a.acao === "comissao_marcada"), false);
});
await ok("marcar cobrança do MÊS CORRENTE segue como antes (prevista/confirmada conforme a cobrança)", async () => {
  const db = cenario();
  const a = cobranca(db, { enviado_em: "2026-10-02T15:00:00.000Z" });
  const b = cobranca(db, { enviado_em: "2026-10-03T15:00:00.000Z", status: "validada", data_vencimento: "2026-10-30" });
  assert.equal((await marcar(a)).status, 201); assert.equal((await marcar(b)).status, 201);
  assert.deepEqual([doCob(db, a)[0].status, doCob(db, b)[0].status], ["prevista", "confirmada"]);
});
await ok("retroativo_pendente que JÁ existia: aparece na tela do beneficiário (tabela do mês de competência), sem contar nos totais de previsto/confirmado", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-09-20T15:00:00.000Z", status: "validada", data_vencimento: "2026-10-30" });
  const l = retroativoExistente(db, c);
  const m = await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-09" });
  assert.deepEqual(m.corpo.lancamentos.map((x: any) => [x.id, x.status]), [[l.id, "retroativo_pendente"]]);
  assert.deepEqual(m.corpo.totais, { previsto: 0, confirmado: 0, contestado: 0, retroativoPendente: 20, aReceber: 0, pago: 0 });
});
await ok("tela do beneficiário não tem o cartão nem o texto de retroativo; a da diretoria mantém o cartão e o subtítulo atual", () => {
  const minhas = fs.readFileSync("src/components/comissao/MinhasComissoesClient.tsx", "utf8");
  assert.equal(/retroativ/i.test(minhas.replace("semRetroativo", "")), false, "nenhuma menção a retroativo na tela do beneficiário");
  assert.ok(minhas.includes("semRetroativo") && minhas.includes("Marque aqui as comissões que são suas, até o fim do mês."));
  const ui = fs.readFileSync("src/components/comissao/ui.tsx", "utf8");
  assert.ok(ui.includes("{!semRetroativo && <CardTotal titulo=\"Retroativo pendente\""));
  const dir = fs.readFileSync("src/components/comissao/ComissoesDiretoriaClient.tsx", "utf8");
  assert.equal(dir.includes("<GradeTotais totais={dados.totais} />"), true, "diretoria sem a flag => cartão de retroativo");
  assert.equal(dir.includes("sem fechamento mensal nesta fase"), false);
  assert.ok(dir.includes("competência = mês de envio da cobrança para validação"));
});
await ok("diretoria continua vendo e aprovando retroativo existente (registra quem/quando): passa a valer pelo status da cobrança (validada => confirmada)", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-09-20T15:00:00.000Z", status: "validada", data_vencimento: "2026-10-30" });
  const { id } = retroativoExistente(db, c); logar(db, "dir");
  const lista = await chamar(R.todas.GET, { url: "http://t/api?mes=2026-09" });
  assert.ok(lista.corpo.retroativosPendentes.some((l: any) => l.id === id), "diretoria enxerga o pendente");
  const r = await chamar(R.retro.POST, { metodo: "POST", params: { id }, corpo: { decisao: "aprovar" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const l = doCob(db, c)[0];
  assert.deepEqual([l.status, l.decidido_por], ["confirmada", "u-dir"]);
  assert.ok(l.decidido_em);
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_retroativo_aprovado"));
  assert.equal((await chamar(R.retro.POST, { metodo: "POST", params: { id }, corpo: { decisao: "aprovar" } })).status, 409, "decidir de novo é recusado");
});
await ok("diretoria recusa o retroativo existente (motivo obrigatório): vira 'recusada', registrada; a cobrança de mês passado continua fora do alcance do beneficiário", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-09-20T15:00:00.000Z" });
  const { id } = retroativoExistente(db, c); logar(db, "dir");
  assert.equal((await chamar(R.retro.POST, { metodo: "POST", params: { id }, corpo: { decisao: "recusar" } })).status, 400);
  assert.equal((await chamar(R.retro.POST, { metodo: "POST", params: { id }, corpo: { decisao: "recusar", motivo: "Já foi paga em outro mês" } })).status, 200);
  const l = doCob(db, c)[0];
  assert.deepEqual([l.status, l.decidido_por, l.resolucao_nota], ["recusada", "u-dir", "Já foi paga em outro mês"]);
  logar(db, "gio");
  assert.equal((await marcar(c)).status, 409, "mês encerrado vale também depois de recusada");
  assert.equal(doCob(db, c).length, 1, "só o lançamento recusado, no histórico");
});
await ok("\"Cobranças para marcar\": só as de contratação enviadas NO MÊS CORRENTE (geradas por qualquer analista), sem exigir acesso à cobrança; mês passado some; canceladas, em revisão, de cancelamento, sem envio/fee e reposição ficam de fora", async () => {
  const db = cenario();
  db.tabelas.cobranca_rs_analistas_acesso = []; // Giovanni sem acesso amplo
  const velha = cobranca(db, { enviado_em: "2026-09-10T15:00:00.000Z", status: "paga", gerado_por_user_id: "u-reb" });
  const corrente = cobranca(db, { enviado_em: "2026-10-02T15:00:00.000Z", gerado_por_user_id: "u-reb" });
  const validada = cobranca(db, { enviado_em: "2026-10-03T15:00:00.000Z", status: "validada", gerado_por_user_id: "u-out" });
  cobranca(db, { enviado_em: "2026-09-10T15:00:00.000Z", vaga_id: V_REPOSICAO });
  cobranca(db, { enviado_em: "2026-09-10T15:00:00.000Z", status: "cancelada" });
  cobranca(db, { enviado_em: "2026-09-10T15:00:00.000Z", status: "pendente_revisao" });
  cobranca(db, { enviado_em: "2026-09-10T15:00:00.000Z", tipo: "cancelamento" });
  cobranca(db, { enviado_em: "2026-09-10T15:00:00.000Z", fee_valor: null });
  cobranca(db, { enviado_em: null });
  const r = await chamar(R.paraMarcar.GET);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.cobrancas.map((c: any) => c.id).sort(), [corrente, validada].sort());
  assert.equal(r.corpo.cobrancas.some((c: any) => c.id === velha), false, "cobrança de mês passado não é listada");
  const v = r.corpo.cobrancas.find((c: any) => c.id === corrente);
  assert.deepEqual([v.competencia, v.comissao_prevista, v.gerada_por, v.marcada], ["2026-10-01", 20, "Rebecca Zambonini", null]);
});
await ok("limite do mês em America/Sao_Paulo: enviada 31/10 23:30 BRT NÃO aparece em novembro; enviada 01/11 00:10 BRT aparece (e só esta pode ser marcada)", async () => {
  congelarData("2026-11-10T15:00:00Z");
  try {
    const db = cenario();
    const outubro = cobranca(db, { enviado_em: "2026-10-31T23:30:00-03:00" });
    const novembro = cobranca(db, { enviado_em: "2026-11-01T00:10:00-03:00" });
    const r = await chamar(R.paraMarcar.GET);
    assert.deepEqual(r.corpo.cobrancas.map((c: any) => [c.id, c.competencia]), [[novembro, "2026-11-01"]]);
    assert.deepEqual([(await marcar(outubro)).status, (await marcar(outubro)).corpo.codigo], [409, "mes_encerrado"]);
    assert.equal((await marcar(novembro)).status, 201);
  } finally { congelarData(); }
});
await ok("\"Cobranças para marcar\" mostra SÓ cliente, vaga/cargo, quem gerou, envio, status e fee — nenhum dado fiscal, e-mail ou anexo", async () => {
  const db = cenario();
  cobranca(db, { cliente_cnpj_snapshot: "12.345.678/0001-90", cliente_email_snapshot: "financeiro@cliente.com", cliente_endereco_snapshot: "Rua X, 1", cliente_telefone_snapshot: "19999990000", salario: 1000, candidato_nome_snapshot: "Joao Segredo" });
  const r = await chamar(R.paraMarcar.GET);
  assert.deepEqual(Object.keys(r.corpo.cobrancas[0]).sort(), ["cargo", "cliente", "competencia", "comissao_prevista", "enviado_em", "fee_valor", "gerada_por", "id", "marcada", "status", "vaga"].sort());
  const bruto = JSON.stringify(r.corpo);
  for (const proibido of ["12.345.678", "financeiro@cliente.com", "Rua X", "19999990000", "Joao Segredo"]) assert.equal(bruto.includes(proibido), false, proibido);
});
await ok("\"Cobranças para marcar\": mês corrente marca como prevista; já marcada por outro aparece como \"outro\" SEM expor a comissão alheia; a minha como \"voce\"", async () => {
  const db = cenario(); db.tabelas.cobranca_rs_analistas_acesso = [];
  const cor = cobranca(db);
  const deOutro = cobranca(db, { gerado_por_user_id: "u-out" }); const minha = cobranca(db); // gerada por Outra Analista, marcada pela Rebecca
  logar(db, "reb"); assert.equal((await marcar(deOutro)).status, 201); logar(db, "gio");
  assert.equal((await marcar(cor)).status, 201); assert.equal((await marcar(minha)).status, 201);
  assert.equal(doCob(db, cor)[0].status, "prevista");
  const r = await chamar(R.paraMarcar.GET);
  const por = Object.fromEntries(r.corpo.cobrancas.map((c: any) => [c.id, c.marcada]));
  assert.deepEqual([por[deOutro], por[cor], por[minha]], ["outro", "voce", "voce"]);
  const bruto = JSON.stringify(r.corpo.cobrancas.find((c: any) => c.id === deOutro));
  assert.equal(bruto.includes("Rebecca"), false, "não revela quem marcou");
  assert.equal(/beneficiario|valor_comissao|lancamento/.test(bruto), false, "não expõe o lançamento alheio");
  assert.equal((await marcar(deOutro)).status, 409, "marcação dupla continua bloqueada");
});

// ── 5) Desmarcar ──
await ok("desmarcar: enquanto a cobrança aguarda validação o beneficiário desfaz (vira 'cancelada', nunca apaga) e pode marcar de novo; depois de validada, não", async () => {
  const db = cenario(); const c = cobranca(db);
  await marcar(c); const id = doCob(db, c)[0].id;
  const d = await chamar(R.desmarcar.POST, { metodo: "POST", corpo: { lancamento_id: id } });
  assert.equal(d.status, 200, JSON.stringify(d.corpo));
  assert.equal(doCob(db, c)[0].status, "cancelada");
  assert.equal((await marcar(c)).status, 201);
  assert.equal(doCob(db, c).length, 2);
  logar(db, "dir"); await vencimento(c, "2026-11-10"); logar(db, "gio");
  const ativo = doCob(db, c).find((l: any) => l.status === "confirmada");
  const d2 = await chamar(R.desmarcar.POST, { metodo: "POST", corpo: { lancamento_id: ativo.id } });
  assert.equal(d2.status, 409); assert.equal(d2.corpo.codigo, "desmarcar_bloqueado");
});

// ── 6) Visibilidade ──
await ok("beneficiário NÃO vê comissão de outro: lista só as dele; desmarcar/consultar a de outro responde 404/sem dado", async () => {
  const db = cenario(); const cG = cobranca(db); const cR = cobranca(db);
  await marcar(cG); logar(db, "reb"); await marcar(cR);
  const idR = doCob(db, cR)[0].id;
  logar(db, "gio");
  const m = await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-10" });
  assert.deepEqual(m.corpo.lancamentos.map((l: any) => l.cobranca_id), [cG]);
  assert.equal(m.corpo.beneficiario.id, BEN_GIO);
  assert.equal((await chamar(R.desmarcar.POST, { metodo: "POST", corpo: { lancamento_id: idR } })).status, 404);
  assert.equal(doCob(db, cR)[0].status, "prevista", "a comissão da Rebecca não foi tocada");
  const e = await chamar(R.daCobranca.GET, { params: { id: cR } });
  assert.equal(e.corpo.lancamento, null, "o quadro da cobrança não expõe o lançamento de outro");
  assert.equal(e.corpo.marcada_por_outro, true);
  // diretoria vê as duas e totais por pessoa
  logar(db, "dir");
  const t = await chamar(R.todas.GET, { url: "http://t/api?mes=2026-10" });
  assert.equal(t.status, 200);
  assert.equal(t.corpo.lancamentos.length, 2);
  assert.deepEqual(t.corpo.totaisPorBeneficiario.map((b: any) => [b.nome, b.totais.previsto]).sort(), [["Giovanni Prado", 20], ["Rebecca Zambonini", 20]]);
  assert.deepEqual(t.corpo.totais, { previsto: 40, confirmado: 0, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 0 });
});
await ok("rotas da diretoria negam beneficiário comum (403) e anônimo (401)", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id;
  for (const quem of ["gio", "outra"]) {
    logar(db, quem);
    assert.equal((await chamar(R.todas.GET)).status, 403);
    assert.equal((await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "teste" } })).status, 403);
    assert.equal((await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "estorno", valor: 5, motivo: "teste" } })).status, 403);
    assert.equal((await chamar(R.beneficiarios.POST, { metodo: "POST", corpo: { analista_perfil_id: "x", percentual: 5, ativo: true } })).status, 403);
  }
  logar(db, null);
  assert.equal((await chamar(R.todas.GET)).status, 401);
});
await ok("exceção individual (usuario_acesso_customizado) vence o padrão: libera 'comissoes' a uma analista; bloquear 'comissoes_minhas' fecha a beneficiária", async () => {
  const db = cenario(); cobranca(db);
  db.tabelas.usuario_acesso_customizado = [{ id: "e1", analista_perfil_id: P_OUT, chave_aba: "comissoes", liberado: true }];
  logar(db, "outra");
  assert.equal((await chamar(R.todas.GET)).status, 200);
  db.tabelas.usuario_acesso_customizado.push({ id: "e2", analista_perfil_id: P_GIO, chave_aba: "comissoes_minhas", liberado: false });
  logar(db, "gio");
  assert.equal((await chamar(R.minhas.GET)).status, 403);
});

// ── 7) Contestação, ajuste e estorno (ledger imutável) ──
await ok("contestar: diretoria contesta com motivo; o beneficiário vê 'contestada' + motivo; sem motivo é recusado; só prevista/confirmada", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  assert.equal((await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "" } })).status, 400);
  const r = await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Quem conduziu foi a Rebecca" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const l = doCob(db, c)[0];
  assert.deepEqual([l.status, l.status_antes_contestacao, l.contestado_por, l.contestacao_motivo], ["contestada", "prevista", "u-dir", "Quem conduziu foi a Rebecca"]);
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_contestada"));
  logar(db, "gio");
  const m = await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-10" });
  assert.equal(m.corpo.lancamentos[0].status, "contestada");
  assert.equal(m.corpo.lancamentos[0].contestacao_motivo, "Quem conduziu foi a Rebecca");
  assert.equal(m.corpo.totais.contestado, 20);
  logar(db, "dir");
  assert.equal((await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "de novo" } })).status, 409);
});
await ok("sem contestação vale a marcação (nada muda sozinho); contestada não muda de status com a cobrança, mas cancela se a cobrança for cancelada", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Conferir" } });
  await vencimento(c, "2026-11-10");
  assert.equal(doCob(db, c)[0].status, "contestada", "validar a cobrança não resolve a contestação");
  await chamar(R.cancelar.POST, { metodo: "POST", params: { id: c }, corpo: { justificativa: "Cliente desistiu da contratação" } });
  assert.equal(doCob(db, c)[0].status, "cancelada");
});
await ok("resolver contestação — MANTÉM: volta ao status da cobrança, registra quem/quando/por quê, sem lançamento novo", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Conferir" } });
  const r = await chamar(R.resolver.POST, { metodo: "POST", params: { id }, corpo: { acao: "mantem", nota: "Conferido com a Rebecca: é do Giovanni" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const l = doCob(db, c)[0];
  assert.deepEqual([l.status, l.resolvido_por, l.resolucao_nota], ["prevista", "u-dir", "Conferido com a Rebecca: é do Giovanni"]);
  assert.equal(doCob(db, c).length, 1);
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_contestacao_resolvida" && a.detalhes.acao === "mantem"));
});
await ok("resolver contestação — AJUSTA o valor: cria ajuste vinculado (original intacto); o total é a soma assinada", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Valor errado" } });
  const r = await chamar(R.resolver.POST, { metodo: "POST", params: { id }, corpo: { acao: "ajuste", valor: -8, nota: "Metade da taxa foi abatida" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const [orig, aj] = doCob(db, c);
  assert.deepEqual([orig.id, orig.valor_comissao, orig.base_valor, orig.status], [id, 20, 400, "prevista"]);
  assert.deepEqual([aj.tipo, aj.valor_comissao, aj.lancamento_origem_id, aj.status, aj.motivo], ["ajuste", -8, id, "confirmada", "Metade da taxa foi abatida"]);
  logar(db, "gio");
  const m = await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-10" });
  // O ajuste entra no MESMO cartão do original (prevista): 20 − 8 = 12 em "previsto", nada solto em "confirmado".
  assert.deepEqual(m.corpo.totais, { previsto: 12, confirmado: 0, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 0 });
  logar(db, "dir");
  assert.equal((await chamar(R.resolver.POST, { metodo: "POST", params: { id }, corpo: { acao: "ajuste", valor: 0, nota: "zero" } })).status, 409, "já resolvida");
});
await ok("resolver contestação — REMOVE via estorno do que resta: original intacto, estorno negativo vinculado, líquido zero", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Não é dele" } });
  const r = await chamar(R.resolver.POST, { metodo: "POST", params: { id }, corpo: { acao: "remover", nota: "Comissão é da Rebecca" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const [orig, est] = doCob(db, c);
  assert.deepEqual([orig.valor_comissao, orig.status], [20, "prevista"]);
  assert.deepEqual([est.tipo, est.valor_comissao, est.lancamento_origem_id], ["estorno", -20, id]);
  assert.equal(totalizar(doCob(db, c)).previsto + totalizar(doCob(db, c)).confirmado, 0);
});
const TOTAIS_ZERO = { previsto: 0, confirmado: 0, contestado: 0, retroativoPendente: 0, aReceber: 0, pago: 0 };
const totaisMinhas = async (db: any, quem = "gio", mes = "2026-10") => { logar(db, quem); return (await chamar(R.minhas.GET, { url: `http://t/api?mes=${mes}` })).corpo.totais; };
await ok("REMOVER numa comissão PREVISTA: contestada = 20 em 'contestado'; depois do estorno os cartões ficam 0/0/0 (líquido coerente, sem −20 solto em 'confirmado')", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Não é dele" } });
  assert.deepEqual(await totaisMinhas(db), { ...TOTAIS_ZERO, contestado: 20 });
  logar(db, "dir");
  assert.equal((await chamar(R.resolver.POST, { metodo: "POST", params: { id }, corpo: { acao: "remover", nota: "É da Rebecca" } })).status, 200);
  assert.equal(doCob(db, c)[0].status, "prevista");
  assert.deepEqual(await totaisMinhas(db), TOTAIS_ZERO);
  // a diretoria vê o mesmo líquido (total geral e por pessoa)
  logar(db, "dir"); const t = (await chamar(R.todas.GET, { url: "http://t/api?mes=2026-10" })).corpo;
  assert.deepEqual(t.totais, TOTAIS_ZERO);
  assert.deepEqual(t.totaisPorBeneficiario[0].totais, TOTAIS_ZERO);
});
await ok("REMOVER numa comissão CONFIRMADA: o estorno abate o 'confirmado' (20 − 20 = 0), previsto continua 0", async () => {
  const db = cenario(); const c = cobranca(db, { status: "validada", data_vencimento: "2026-11-10" }); await marcar(c); const id = doCob(db, c)[0].id;
  assert.equal(doCob(db, c)[0].status, "confirmada");
  assert.deepEqual(await totaisMinhas(db), { ...TOTAIS_ZERO, confirmado: 20 });
  logar(db, "dir");
  await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Não é dele" } });
  assert.deepEqual(await totaisMinhas(db), { ...TOTAIS_ZERO, contestado: 20 });
  logar(db, "dir");
  assert.equal((await chamar(R.resolver.POST, { metodo: "POST", params: { id }, corpo: { acao: "remover", nota: "É da Rebecca" } })).status, 200);
  assert.equal(doCob(db, c)[0].status, "confirmada");
  assert.deepEqual(await totaisMinhas(db), TOTAIS_ZERO);
});
await ok("o estorno acompanha o status do original: estorno parcial de comissão PREVISTA reduz 'previsto'; quando a cobrança é validada, o par inteiro passa para 'confirmado'; original cancelado leva o estorno junto", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id; logar(db, "dir");
  await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "estorno", valor: 5, motivo: "abatimento parcial" } });
  assert.deepEqual(await totaisMinhas(db), { ...TOTAIS_ZERO, previsto: 15 });
  logar(db, "dir"); await vencimento(c, "2026-11-10");
  assert.deepEqual(await totaisMinhas(db), { ...TOTAIS_ZERO, confirmado: 15 });
  logar(db, "dir"); await chamar(R.cancelar.POST, { metodo: "POST", params: { id: c }, corpo: { justificativa: "Cliente desistiu da contratação" } });
  assert.deepEqual(await totaisMinhas(db), TOTAIS_ZERO, "original cancelado: nada conta, nem o estorno");
});
await ok("estorno em OUTRO mês (original de setembro aprovado como retroativo, estornado em outubro): cada mês mostra o seu lado e o estorno cai no cartão do status do original", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-09-20T15:00:00.000Z", status: "validada", data_vencimento: "2026-10-30" });
  const { id } = retroativoExistente(db, c); logar(db, "dir");
  await chamar(R.retro.POST, { metodo: "POST", params: { id }, corpo: { decisao: "aprovar" } });
  await chamar(R.contestar.POST, { metodo: "POST", params: { id }, corpo: { motivo: "Não é dele" } });
  await chamar(R.resolver.POST, { metodo: "POST", params: { id }, corpo: { acao: "remover", nota: "É da Rebecca" } });
  assert.deepEqual(await totaisMinhas(db, "gio", "2026-09"), { ...TOTAIS_ZERO, confirmado: 20 });
  assert.deepEqual(await totaisMinhas(db, "gio", "2026-10"), { ...TOTAIS_ZERO, confirmado: -20 }, "o estorno é de outubro (mês em que foi registrado), no cartão do original (confirmado)");
});
await ok("ajuste/estorno manual: original NUNCA editado; estorno acima do que resta é recusado; motivo obrigatório; vale também após paga (só registro)", async () => {
  const db = cenario(); const c = cobranca(db, { status: "paga", enviado_em: "2026-10-02T15:00:00Z" }); await marcar(c);
  const id = doCob(db, c)[0].id; logar(db, "dir");
  assert.equal(doCob(db, c)[0].status, "confirmada");
  const antes = structuredClone(doCob(db, c)[0]);
  assert.equal((await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "estorno", valor: 5, motivo: "" } })).status, 400);
  assert.equal((await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "estorno", valor: 25, motivo: "excede" } })).status, 422);
  assert.equal((await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "estorno", valor: -5, motivo: "negativo" } })).status, 400);
  const e1 = await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "estorno", valor: 15, motivo: "Cliente devolveu parte da taxa" } });
  assert.equal(e1.status, 201, JSON.stringify(e1.corpo));
  assert.equal(e1.corpo.lancamento.valor_comissao, -15);
  assert.equal((await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "estorno", valor: 6, motivo: "passa do que resta (5)" } })).status, 422);
  assert.equal((await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "ajuste", valor: 3, motivo: "bônus" } })).status, 201);
  assert.deepEqual(doCob(db, c).find((l: any) => l.id === id), antes, "o lançamento original ficou exatamente como estava");
  assert.deepEqual(totalizar(doCob(db, c)).confirmado, 20 - 15 + 3);
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_estorno_criado"));
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_ajuste_criado"));
});
await ok("ajuste sobre lançamento cancelado/recusado é recusado; o serviço nunca usa DELETE em comissao_lancamentos", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); const id = doCob(db, c)[0].id;
  await chamar(R.desmarcar.POST, { metodo: "POST", corpo: { lancamento_id: id } }); logar(db, "dir");
  assert.equal((await chamar(R.ajuste.POST, { metodo: "POST", corpo: { lancamento_origem_id: id, tipo: "ajuste", valor: 3, motivo: "teste" } })).status, 409);
  const fonte = fs.readFileSync("src/lib/comissao.ts", "utf8");
  assert.ok(!/\.delete\(\)/.test(fonte), "o serviço não apaga linhas do ledger");
});
await ok("beneficiários (diretoria): cria/atualiza percentual e ativo com auditoria; o percentual novo só vale para marcações novas", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c); logar(db, "dir");
  const r = await chamar(R.beneficiarios.POST, { metodo: "POST", corpo: { analista_perfil_id: P_GIO, percentual: 6, ativo: true } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(db.tabelas.comissao_beneficiarios.find((b: any) => b.id === BEN_GIO).percentual, 6);
  assert.equal(doCob(db, c)[0].percentual_aplicado, 5, "lançamento existente mantém o percentual que aplicou");
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_beneficiario_atualizado"));
  assert.equal((await chamar(R.beneficiarios.POST, { metodo: "POST", corpo: { analista_perfil_id: P_GIO, percentual: 101, ativo: true } })).status, 400);
  const novo = await chamar(R.beneficiarios.POST, { metodo: "POST", corpo: { analista_perfil_id: P_OUT, percentual: 5, ativo: true } });
  assert.equal(novo.status, 200);
  assert.ok(auditoria(db).some((a: any) => a.acao === "comissao_beneficiario_criado"));
});
await ok("reconciliação na leitura: se uma rota da cobrança não sincronizou, a tela corrige (rede de segurança)", async () => {
  const db = cenario(); const c = cobranca(db); await marcar(c);
  const cob = db.tabelas.cobrancas_rs.find((x: any) => x.id === c); cob.status = "validada"; cob.fee_valor = 600; // mudou "por fora"
  const m = await chamar(R.minhas.GET, { url: "http://t/api?mes=2026-10" });
  assert.deepEqual([m.corpo.lancamentos[0].status, m.corpo.lancamentos[0].valor_comissao], ["confirmada", 30]);
});

// ── 8) Acesso no layout do painel: no máximo 2 consultas, sem consulta extra de perfil ──
await ok("resolverAcessoComissoes com o perfil já carregado faz no máximo 2 consultas (beneficiário + exceções), qualquer papel; mantém o comportamento", async () => {
  const db = cenario();
  const casos: [string, string, boolean, boolean][] = [
    ["gio", P_GIO, true, false], // beneficiário analista: vê "Minhas", não vê "Comissões"
    ["outra", P_OUT, false, false], // analista comum: nada
    ["dir", "p-u-dir", false, true], // diretoria: vê "Comissões"
  ];
  for (const [quem, perfilId, minhas, diretoria] of casos) {
    db.consultas.length = 0;
    const a = await R.auth.resolverAcessoComissoes(USUARIOS[quem], { id: perfilId, nome_completo: "x" });
    assert.deepEqual([a.minhas, a.diretoria], [minhas, diretoria], quem);
    assert.ok(db.consultas.length <= 2, `${quem}: ${db.consultas.length} consultas -> ${JSON.stringify(db.consultas)}`);
    assert.deepEqual(db.consultas.map((c: any) => c.tabela).sort(), ["comissao_beneficiarios", "usuario_acesso_customizado"]);
  }
  // sem o perfil carregado: +1 consulta (o perfil), nunca mais que 3
  db.consultas.length = 0;
  await R.auth.resolverAcessoComissoes(USUARIOS.gio);
  assert.ok(db.consultas.length <= 3);
  // exceção individual vence nos dois sentidos, ainda com 2 consultas
  db.tabelas.usuario_acesso_customizado = [{ id: "x1", analista_perfil_id: P_OUT, chave_aba: "comissoes", liberado: true }, { id: "x2", analista_perfil_id: P_GIO, chave_aba: "comissoes_minhas", liberado: false }, { id: "x3", analista_perfil_id: "p-u-dir", chave_aba: "comissoes", liberado: false }];
  db.consultas.length = 0;
  assert.equal((await R.auth.resolverAcessoComissoes(USUARIOS.outra, { id: P_OUT })).diretoria, true);
  assert.equal((await R.auth.resolverAcessoComissoes(USUARIOS.gio, { id: P_GIO })).minhas, false);
  assert.equal((await R.auth.resolverAcessoComissoes(USUARIOS.dir, { id: "p-u-dir" })).diretoria, false);
  assert.equal(db.consultas.length, 6);
  // sem perfil de analista: só vale o padrão do papel
  assert.deepEqual((({ minhas, diretoria }) => ({ minhas, diretoria }))(await R.auth.resolverAcessoComissoes(usuario("u-sem-perfil", "diretoria"))), { minhas: false, diretoria: true });
});

console.log(`\n${n} verificações OK`);
