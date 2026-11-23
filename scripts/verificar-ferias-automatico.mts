// Férias: mudança AUTOMÁTICA de situação pelas datas programadas (programada → em férias no dia do início; em férias → tiradas no dia seguinte ao fim).
// Roda no cron diário (antes dos avisos) e ao listar. Banco em memória do harness; nada de produção.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-ferias-automatico.mts
import assert from "node:assert/strict";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, HOJE, dataMais, novoDb, logar, importar, chamar, flush, funcionarioMot, idMot, auditoria } from "./harness-mot/ambiente.mjs";
import { calcularPeriodo, decidirMudancaAutomatica, programacaoVencida } from "../src/lib/feriasRegras";

congelarData(AGORA_ISO); // 07/10/2026 12:00 em Brasília
process.env.CRON_SECRET = "segredo-de-teste";
const LIB = await importar("src/lib/feriasPeriodos.ts");
const AVISOS = await importar("src/lib/feriasAvisos.ts");
const R = {
  cron: await importar("src/app/api/cron/ferias-avisos/route.ts"),
  lista: await importar("src/app/api/ferias/route.ts"),
  situacao: await importar("src/app/api/ferias/[funcionarioId]/situacao/route.ts"),
  programar: await importar("src/app/api/ferias/[funcionarioId]/programar/route.ts"),
};
const { createServiceClient } = await importar("scripts/harness-mot/mocks/supabase-server.mjs");
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const TERC = "terceirizacao", MOT = "mao_obra_temporaria";
const id = (k: number) => idMot(950 + k);
const ADM = "2023-01-10"; // período 1 (2023) e 2 (2024) terminados; período 3 em aquisição ou terminado, tanto faz: as datas de gozo são postas à mão
const CRON = { headers: { authorization: "Bearer segredo-de-teste" } };

function cenario(linhas: [number, string, Record<string, unknown>?][], destinatarios: string[] | null = null) {
  const db = novoDb();
  logar(db, "dir");
  db.tabelas.funcionarios = linhas.map(([k, tipo, extra]) => funcionarioMot(id(k), ADM, { tipo_servico: tipo, nome_completo: `ZZTEST Func ${k}`, ...(extra ?? {}) }));
  for (const t of ["rescisoes", "audit_logs", "ferias_periodos", "ferias_config", "notificacoes_analista", "notificacao_popup_vistos"]) db.tabelas[t] = [];
  db.tabelas.aviso_eventos_canais = [{ evento: "ferias_vencimento", canal: "sino", ativo: true }, { evento: "ferias_vencimento", canal: "popup", ativo: true }];
  db.tabelas.aviso_destinatarios = (destinatarios ?? []).map((u, i) => ({ id: `d${i}`, evento: "ferias_vencimento", canal: "sino", tipo_destinatario: "usuario", usuario_id: u, email: null, nome: null, ativo: true }));
  return db;
}
// Período `numero` do funcionário k, com as datas de gozo e a situação desejadas (o resto vem das regras puras, para a data-base bater).
function periodo(db: any, k: number, numero: number, extra: Record<string, unknown>) {
  const c = calcularPeriodo(ADM, numero);
  const p = {
    id: `cccccccc-0000-4000-9000-${String(k * 100 + numero).padStart(12, "0")}`, funcionario_id: id(k), numero, aquisitivo_inicio: c.aquisitivo_inicio, aquisitivo_fim: c.aquisitivo_fim, data_limite: c.data_limite, situacao: "a_programar",
    gozo_inicio: null, gozo_fim: null, observacao: null, origem: "gerado", aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null, unidade_id: "U1", atualizado_por: "u-rh", ...extra,
  };
  db.tabelas.ferias_periodos.push(p);
  return p;
}
const saldoConfirmado = (db: any, ...ks: number[]) => { for (const k of ks) db.tabelas.ferias_config.push({ funcionario_id: id(k), saldo_inicial_confirmado_em: "2026-01-01T12:00:00.000Z", saldo_inicial_quitado_ate: null }); };
const sit = (db: any, k: number, numero = 1) => db.tabelas.ferias_periodos.find((p: any) => p.funcionario_id === id(k) && p.numero === numero)?.situacao;
const audits = (db: any) => auditoria(db).filter((a: any) => a.acao === "ferias_em_gozo" || a.acao === "ferias_gozada");

// Aplica a automação direto na biblioteca (a rota do cron e a lista a chamam do mesmo jeito).
async function aplicar(db: any, hoje = HOJE, limite?: number) {
  const svc = createServiceClient();
  const funcionarios = (await LIB.carregarElegiveis(svc, null)) as any[];
  const { dados } = await LIB.carregarDadosFerias(svc, funcionarios.map((f: any) => f.id));
  const r = await LIB.aplicarMudancasAutomaticasFerias(svc, funcionarios, dados.periodos, hoje, limite);
  await flush();
  return r;
}

// ═════════════════ REGRA PURA: FRONTEIRAS ═════════════════
await ok("regra pura: início hoje → em férias; início amanhã → fica; fim hoje → ainda em férias; fim ontem → tiradas", () => {
  const base = { origem: "gerado" as const };
  const d = (situacao: any, gozo_inicio: string, gozo_fim: string) => decidirMudancaAutomatica({ ...base, situacao, gozo_inicio, gozo_fim }, HOJE);
  assert.equal(d("programada", HOJE, dataMais(HOJE, 10))?.para, "em_gozo", "início hoje");
  assert.equal(d("programada", dataMais(HOJE, 1), dataMais(HOJE, 10)), null, "início amanhã");
  assert.equal(d("programada", dataMais(HOJE, -1), dataMais(HOJE, 10))?.para, "em_gozo", "início ontem, fim no futuro");
  assert.equal(d("programada", dataMais(HOJE, -5), HOJE)?.para, "em_gozo", "fim hoje: o último dia ainda é em férias");
  assert.equal(d("em_gozo", dataMais(HOJE, -5), HOJE), null, "em férias com fim hoje: continua");
  assert.deepEqual(d("em_gozo", dataMais(HOJE, -5), dataMais(HOJE, -1))?.transicoes, [{ de: "em_gozo", para: "gozada" }], "fim ontem: tiradas");
  assert.deepEqual(
    d("programada", dataMais(HOJE, -10), dataMais(HOJE, -1))?.transicoes,
    [{ de: "programada", para: "em_gozo" }, { de: "em_gozo", para: "gozada" }],
    "as duas datas passadas: direto a tiradas, com as duas transições na ordem"
  );
  assert.equal(d("a_programar", dataMais(HOJE, -10), dataMais(HOJE, -1)), null, "a programar nunca muda sozinho");
  assert.equal(d("gozada", dataMais(HOJE, -10), dataMais(HOJE, -1)), null);
  assert.equal(decidirMudancaAutomatica({ situacao: "programada", origem: "saldo_inicial", gozo_inicio: dataMais(HOJE, -10), gozo_fim: dataMais(HOJE, -1) }, HOJE), null, "saldo inicial intocado");
  assert.equal(decidirMudancaAutomatica({ situacao: "programada", origem: "gerado", gozo_inicio: null, gozo_fim: null }, HOJE), null, "sem datas: nada");
});

// ═════════════════ BANCO: TRANSIÇÕES, AUDITORIA, IDEMPOTÊNCIA ═════════════════
await ok("programada com início hoje vira em férias; auditoria com a MESMA ação do clique manual, origem automatico, data de referência e sem usuário; atualizado_por nulo", async () => {
  const db = cenario([[1, TERC]]);
  periodo(db, 1, 1, { situacao: "programada", gozo_inicio: HOJE, gozo_fim: dataMais(HOJE, 14) });
  const r = await aplicar(db);
  assert.deepEqual([r.alteradas, r.erro], [1, null]);
  assert.equal(sit(db, 1), "em_gozo");
  assert.equal(db.tabelas.ferias_periodos[0].atualizado_por, null, "feito pelo sistema");
  const [a] = audits(db);
  assert.deepEqual([audits(db).length, a.acao, a.usuario_id, a.entidade_id], [1, "ferias_em_gozo", null, "cccccccc-0000-4000-9000-000000000101"]);
  assert.deepEqual(
    [a.detalhes.origem, a.detalhes.data_referencia, a.detalhes.situacao_anterior, a.detalhes.funcionario_id, a.detalhes.periodo],
    ["automatico", HOJE, "programada", id(1), 1]
  );
});

await ok("início amanhã e fim hoje: nada muda; fim ontem: em férias vira tiradas", async () => {
  const db = cenario([[1, TERC], [2, TERC], [3, TERC]]);
  periodo(db, 1, 1, { situacao: "programada", gozo_inicio: dataMais(HOJE, 1), gozo_fim: dataMais(HOJE, 15) });
  periodo(db, 2, 1, { situacao: "em_gozo", gozo_inicio: dataMais(HOJE, -14), gozo_fim: HOJE });
  periodo(db, 3, 1, { situacao: "em_gozo", gozo_inicio: dataMais(HOJE, -15), gozo_fim: dataMais(HOJE, -1) });
  const r = await aplicar(db);
  assert.equal(r.alteradas, 1);
  assert.deepEqual([sit(db, 1), sit(db, 2), sit(db, 3)], ["programada", "em_gozo", "gozada"]);
  assert.deepEqual(audits(db).map((a: any) => [a.acao, a.detalhes.situacao_anterior]), [["ferias_gozada", "em_gozo"]]);
});

await ok("programada com as duas datas já passadas (sistema parado) vai direto a tiradas, com 2 auditorias na ordem: em férias e depois tiradas", async () => {
  const db = cenario([[1, TERC]]);
  periodo(db, 1, 1, { situacao: "programada", gozo_inicio: dataMais(HOJE, -20), gozo_fim: dataMais(HOJE, -2) });
  const r = await aplicar(db);
  assert.equal(r.alteradas, 1, "uma gravação só");
  assert.equal(sit(db, 1), "gozada");
  assert.deepEqual(audits(db).map((a: any) => [a.acao, a.detalhes.situacao_anterior, a.detalhes.origem]), [
    ["ferias_em_gozo", "programada", "automatico"],
    ["ferias_gozada", "em_gozo", "automatico"],
  ]);
});

await ok("idempotente: rodar duas vezes no mesmo dia não repete mudança nem auditoria (também pela rota da lista e pelo cron)", async () => {
  const db = cenario([[1, TERC], [2, TERC]]);
  periodo(db, 1, 1, { situacao: "programada", gozo_inicio: dataMais(HOJE, -3), gozo_fim: dataMais(HOJE, 5) });
  periodo(db, 2, 1, { situacao: "programada", gozo_inicio: dataMais(HOJE, -20), gozo_fim: dataMais(HOJE, -2) });
  assert.equal((await aplicar(db)).alteradas, 2);
  // (a lista e o cron também geram os períodos que faltam, como sempre: só os dois períodos programados entram na comparação)
  const foto = () => JSON.stringify([db.tabelas.ferias_periodos.filter((p: any) => p.id.startsWith("cccccccc-")), auditoria(db)]);
  const depoisDaPrimeira = foto();
  assert.equal((await aplicar(db)).alteradas, 0);
  assert.equal((await chamar(R.lista.GET, { url: "http://t/api/ferias" })).status, 200);
  assert.equal((await chamar(R.cron.GET, CRON)).status, 200);
  assert.equal(foto(), depoisDaPrimeira, "nada mudou nas execuções seguintes");
});

await ok("fora da regra da aba não muda: desligado, MOT sem efetivação; efetivado entra; saldo inicial e a programar ficam intocados", async () => {
  const db = cenario([[1, TERC, { status: "desligado" }], [2, MOT], [3, MOT, { efetivado_em: "2026-01-05T12:00:00.000Z" }], [4, TERC]]);
  const passado = { gozo_inicio: dataMais(HOJE, -20), gozo_fim: dataMais(HOJE, -2) };
  periodo(db, 1, 1, { situacao: "programada", ...passado });
  periodo(db, 2, 1, { situacao: "programada", ...passado });
  periodo(db, 3, 1, { situacao: "programada", ...passado });
  periodo(db, 4, 1, { situacao: "programada", origem: "saldo_inicial", ...passado });
  periodo(db, 4, 2, { situacao: "a_programar" });
  const r = await aplicar(db);
  assert.equal(r.alteradas, 1);
  assert.deepEqual([sit(db, 1), sit(db, 2), sit(db, 3), sit(db, 4, 1), sit(db, 4, 2)], ["programada", "programada", "gozada", "programada", "a_programar"]);
  assert.deepEqual(audits(db).map((a: any) => a.detalhes.funcionario_id), [id(3), id(3)]);
});

await ok("limite de escrita por chamada: só `limite` períodos mudam; o resto fica para a próxima", async () => {
  const db = cenario([[1, TERC], [2, TERC], [3, TERC]]);
  for (const k of [1, 2, 3]) periodo(db, k, 1, { situacao: "programada", gozo_inicio: dataMais(HOJE, -1), gozo_fim: dataMais(HOJE, 5) });
  assert.equal((await aplicar(db, HOJE, 2)).alteradas, 2);
  assert.equal(db.tabelas.ferias_periodos.filter((p: any) => p.situacao === "em_gozo").length, 2);
  assert.equal((await aplicar(db, HOJE, 2)).alteradas, 1, "a próxima chamada termina");
});

await ok("troca atômica: se o RH mudou o período no mesmo instante, a automação pula (sem erro e sem auditoria)", async () => {
  const db = cenario([[1, TERC]]);
  const p = periodo(db, 1, 1, { situacao: "programada", gozo_inicio: dataMais(HOJE, -1), gozo_fim: dataMais(HOJE, 5) });
  const svc = createServiceClient();
  const funcionarios = (await LIB.carregarElegiveis(svc, null)) as any[];
  const { dados } = await LIB.carregarDadosFerias(svc, [id(1)]);
  p.situacao = "a_programar"; // o RH reabriu entre a leitura e a escrita
  const r = await LIB.aplicarMudancasAutomaticasFerias(svc, funcionarios, dados.periodos, HOJE);
  await flush();
  assert.deepEqual([r.alteradas, r.erro, sit(db, 1), audits(db).length], [0, null, "a_programar", 0]);
});

// ═════════════════ FUSO ═════════════════
await ok("fuso America/Sao_Paulo: às 22h30 de Brasília (já é o dia seguinte em UTC) vale o dia de Brasília, no cron e na lista", async () => {
  congelarData("2026-10-08T01:30:00.000Z"); // 07/10 22:30 em Brasília; 08/10 em UTC
  try {
    const db = cenario([[1, TERC], [2, TERC]]);
    periodo(db, 1, 1, { situacao: "programada", gozo_inicio: "2026-10-08", gozo_fim: "2026-10-20" }); // começa amanhã em Brasília
    periodo(db, 2, 1, { situacao: "em_gozo", gozo_inicio: "2026-09-20", gozo_fim: "2026-10-07" }); // último dia é hoje em Brasília
    assert.equal((await chamar(R.lista.GET, { url: "http://t/api/ferias" })).status, 200);
    assert.deepEqual([sit(db, 1), sit(db, 2)], ["programada", "em_gozo"], "lista: nada muda às 22h30 de 07/10");
    const c = await chamar(R.cron.GET, CRON);
    assert.equal(c.status, 200);
    assert.deepEqual([c.corpo.mudancasAutomaticas, sit(db, 1), sit(db, 2)], [0, "programada", "em_gozo"], "cron: idem");
    congelarData("2026-10-08T03:30:00.000Z"); // 08/10 00:30 em Brasília
    const c2 = await chamar(R.cron.GET, CRON);
    assert.deepEqual([c2.corpo.mudancasAutomaticas, sit(db, 1), sit(db, 2)], [2, "em_gozo", "gozada"], "virou o dia em Brasília: agora muda");
  } finally {
    congelarData(AGORA_ISO);
  }
});

// ═════════════════ CRON: ANTES DOS AVISOS, E FALHA PARA TUDO ═════════════════
await ok("cron: a automação roda ANTES dos avisos (programada de início vencido e prazo vencido NÃO gera aviso falso nem duplicado)", async () => {
  const db = cenario([[1, TERC]], ["u-dir"]);
  saldoConfirmado(db, 1);
  // Período 1 já passou da data-limite e está programada com início ontem: antes da automação isso era "programação vencida" e o cron mandava o aviso de VENCIDO.
  const p1 = periodo(db, 1, 1, { situacao: "programada", gozo_inicio: dataMais(HOJE, -1), gozo_fim: dataMais(HOJE, 9) });
  for (const numero of [2, 3, 4]) periodo(db, 1, numero, { situacao: "gozada", origem: "saldo_inicial" });
  assert.equal(programacaoVencida(p1, HOJE), true, "pré-condição: sem a automação este período pediria aviso");
  const r = await chamar(R.cron.GET, CRON);
  assert.equal(r.status, 200);
  assert.deepEqual([r.corpo.mudancasAutomaticas, r.corpo.avisosEnviados, r.corpo.vencidos, sit(db, 1, 1), db.tabelas.notificacoes_analista.length], [1, 0, 0, "em_gozo", 0]);
  const r2 = await chamar(R.cron.GET, CRON);
  assert.deepEqual([r2.corpo.mudancasAutomaticas, r2.corpo.avisosEnviados], [0, 0], "segundo cron do dia: nada");
});

await ok("falha na mudança automática: o cron NÃO envia nem marca nada, responde 503 com o motivo; a lista não cai", async () => {
  const db = cenario([[1, TERC], [2, TERC]], ["u-dir"]);
  saldoConfirmado(db, 1, 2);
  // funcionário 2 tem período vencido (pediria aviso); funcionário 1 tem a mudança automática que vai falhar
  const hojeAntes = dataMais(HOJE, -400);
  periodo(db, 1, 1, { situacao: "gozada", origem: "saldo_inicial" });
  periodo(db, 1, 2, { situacao: "gozada", origem: "saldo_inicial" });
  periodo(db, 1, 3, { situacao: "programada", gozo_inicio: dataMais(HOJE, -1), gozo_fim: dataMais(HOJE, 9) });
  periodo(db, 2, 1, { situacao: "a_programar" });
  assert.ok(hojeAntes < HOJE);
  db.falhas["ferias_periodos.update"] = "falha de rede simulada";
  const r = await chamar(R.cron.GET, CRON);
  assert.equal(r.status, 503);
  assert.match(r.corpo.erro, /mudança automática/i);
  assert.equal(db.tabelas.notificacoes_analista.length, 0, "nada enviado");
  assert.equal(db.tabelas.ferias_periodos.every((p: any) => !p.aviso_90_em && !p.aviso_60_em && !p.aviso_30_em && !p.aviso_vencido_em), true, "nada marcado");
  assert.equal(sit(db, 1, 3), "programada");
  assert.equal(audits(db).length, 0, "sem auditoria de mudança que não aconteceu");
  const l = await chamar(R.lista.GET, { url: "http://t/api/ferias" });
  assert.equal(l.status, 200, "a lista não cai por causa da automação");
  assert.equal(l.corpo.data.find((x: any) => x.funcionario_id === id(1)).periodo.situacao, "programada", "mostra como está");
  delete db.falhas["ferias_periodos.update"];
  const ok2 = await chamar(R.cron.GET, CRON);
  assert.deepEqual([ok2.status, ok2.corpo.mudancasAutomaticas, sit(db, 1, 3)], [200, 1, "em_gozo"], "voltando ao normal, o cron resolve");
});

await ok("lista: GET /api/ferias já mostra a situação atualizada (sem esperar o cron)", async () => {
  const db = cenario([[1, TERC]]);
  saldoConfirmado(db, 1);
  periodo(db, 1, 1, { situacao: "gozada", origem: "saldo_inicial" });
  periodo(db, 1, 2, { situacao: "gozada", origem: "saldo_inicial" });
  periodo(db, 1, 3, { situacao: "programada", gozo_inicio: dataMais(HOJE, -4), gozo_fim: dataMais(HOJE, 6) });
  const l = await chamar(R.lista.GET, { url: "http://t/api/ferias" });
  const linha = l.corpo.data.find((x: any) => x.funcionario_id === id(1));
  assert.deepEqual([linha.periodo.situacao, linha.programacao_vencida, sit(db, 1, 3)], ["em_gozo", false, "em_gozo"]);
  assert.deepEqual(audits(db).map((a: any) => a.detalhes.origem), ["automatico"]);
});

// ═════════════════ CLIQUE MANUAL E REABRIR ═════════════════
await ok("o clique manual continua gravando como antes: com o usuário e SEM origem automática", async () => {
  const db = cenario([[1, TERC]]);
  saldoConfirmado(db, 1);
  periodo(db, 1, 1, { situacao: "gozada", origem: "saldo_inicial" });
  periodo(db, 1, 2, { situacao: "gozada", origem: "saldo_inicial" });
  const p3 = periodo(db, 1, 3, { situacao: "a_programar" });
  const r = await chamar(R.situacao.POST, { metodo: "POST", params: { funcionarioId: id(1) }, corpo: { periodo_id: p3.id, acao: "em_gozo", gozo_inicio: dataMais(HOJE, -2), gozo_fim: dataMais(HOJE, 10) } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const [a] = audits(db);
  assert.deepEqual([a.acao, a.usuario_id !== null, "origem" in a.detalhes, db.tabelas.ferias_periodos.find((p: any) => p.id === p3.id).atualizado_por !== null], ["ferias_em_gozo", true, false, true]);
});

await ok("Reabrir depois de mudança automática funciona e não gera novo ciclo (datas apagadas, volta a programar); Alterar datas de uma programada continua valendo", async () => {
  const db = cenario([[1, TERC]]);
  saldoConfirmado(db, 1);
  periodo(db, 1, 1, { situacao: "gozada", origem: "saldo_inicial" });
  periodo(db, 1, 2, { situacao: "gozada", origem: "saldo_inicial" });
  const p3 = periodo(db, 1, 3, { situacao: "programada", gozo_inicio: dataMais(HOJE, -20), gozo_fim: dataMais(HOJE, -2) });
  assert.equal((await chamar(R.lista.GET, { url: "http://t/api/ferias" })).status, 200);
  assert.equal(sit(db, 1, 3), "gozada", "a lista moveu direto para tiradas");
  const linha = (await chamar(R.lista.GET, { url: "http://t/api/ferias" })).corpo.data.find((x: any) => x.funcionario_id === id(1));
  assert.equal(linha.reabrivel?.id, p3.id, "o período que o sistema moveu é reabrível");
  const reabrir = await chamar(R.situacao.POST, { metodo: "POST", params: { funcionarioId: id(1) }, corpo: { periodo_id: p3.id, acao: "reabrir", motivo: "datas combinadas erradas" } });
  assert.equal(reabrir.status, 200, JSON.stringify(reabrir.corpo));
  const depois = db.tabelas.ferias_periodos.find((p: any) => p.id === p3.id);
  assert.deepEqual([depois.situacao, depois.gozo_inicio, depois.gozo_fim], ["a_programar", null, null]);
  const antes = JSON.stringify(auditoria(db));
  assert.equal((await aplicar(db)).alteradas, 0, "sem datas, não há nova mudança automática");
  assert.equal((await chamar(R.cron.GET, CRON)).status, 200);
  assert.equal(sit(db, 1, 3), "a_programar");
  assert.equal(JSON.stringify(auditoria(db)), antes);
  // Alterar datas: programada com início futuro, trocar as datas continua funcionando e a automação só age quando o início chegar.
  const prog = await chamar(R.programar.POST, { metodo: "POST", params: { funcionarioId: id(1) }, corpo: { periodo_id: p3.id, gozo_inicio: dataMais(HOJE, 3), gozo_fim: dataMais(HOJE, 10) } });
  assert.equal(prog.status, 200, JSON.stringify(prog.corpo));
  const alt = await chamar(R.programar.POST, { metodo: "POST", params: { funcionarioId: id(1) }, corpo: { periodo_id: p3.id, gozo_inicio: dataMais(HOJE, 5), gozo_fim: dataMais(HOJE, 12) } });
  assert.equal(alt.status, 200, JSON.stringify(alt.corpo));
  assert.equal(sit(db, 1, 3), "programada");
});

await ok("avisos: o resumo do cron informa mudancasAutomaticas e a lib de avisos usa a função única (sem duplicar a regra)", () => {
  assert.equal(typeof AVISOS.executarAvisosFerias, "function");
});

console.log(`\n${n} verificações da mudança automática de férias passaram.`);
