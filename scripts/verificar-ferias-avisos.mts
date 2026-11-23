// Férias (aviso de vencimento), etapa 2D: o cron diário /api/cron/ferias-avisos (marcos de 90, 60 e 30 dias, "vencido" e lembretes), as garantias (idempotente, só marca
// depois de enviar, sem destinatário nada é enviado nem marcado), o popup (visto por aviso) e o catálogo de avisos. Roda contra o banco em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-ferias-avisos.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, AGORA_ISO, HOJE, dataMais, novoDb, logar, importar, chamar, funcionarioMot, idMot } from "./harness-mot/ambiente.mjs";
import { adicionarDiasISO, calcularPeriodo, DIAS_LEMBRETE_VENCIDO } from "../src/lib/feriasRegras";
import { NOTA_EVENTO, ROTULO_EVENTO, ROTULO_GRUPO, EVENTOS_POR_GRUPO, canaisDoEvento, canalSemListaPermitido, canalSoInterruptor, grupoDoEvento, ligadoSemLinha } from "../src/lib/avisosCatalogo";

congelarData(AGORA_ISO); // 07/10/2026
process.env.CRON_SECRET = "segredo-de-teste";
const LIB = await importar("src/lib/feriasAvisos.ts");
const R = {
  cron: await importar("src/app/api/cron/ferias-avisos/route.ts"),
  popup: await importar("src/app/api/ferias-popup/route.ts"),
  visto: await importar("src/app/api/ferias-popup/marcar-visto/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };

const TERC = "terceirizacao", MOT = "mao_obra_temporaria";
const id = (k: number) => idMot(900 + k);
const EVENTO = "ferias_vencimento";
type Extra = Record<string, unknown>;

// Admissão que faz a data-limite do período 1 cair em `limite` (confere com as regras puras).
function admissaoComLimite(limite: string): string {
  const [a, m, d] = limite.split("-").map(Number);
  const adm = adicionarDiasISO(`${a - 2}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, 1);
  assert.equal(calcularPeriodo(adm, 1).data_limite, limite, `admissão ${adm} deveria ter data-limite ${limite}`);
  return adm;
}
const limiteEm = (dias: number) => dataMais(HOJE, dias);
const agoraDe = (dia: string) => new Date(`${dia}T15:00:00.000Z`);

interface Opcoes { destinatarios?: string[] | null; sinoLigado?: boolean; popupLigado?: boolean }
// [k, tipo, admissão, extra]; destinatários do sino (padrão: só a diretoria, que atende todas as unidades).
function cenario(linhas: [number, string, string | null, Extra?][], op: Opcoes = {}) {
  const db = novoDb();
  logar(db, "dir");
  db.tabelas.funcionarios = linhas.map(([k, tipo, adm, extra]) => funcionarioMot(id(k), adm as string, { tipo_servico: tipo, nome_completo: `ZZTEST Func ${k}`, ...(extra ?? {}) }));
  db.tabelas.rescisoes = [];
  db.tabelas.audit_logs = [];
  db.tabelas.ferias_periodos = [];
  db.tabelas.ferias_config = [];
  db.tabelas.notificacoes_analista = [];
  db.tabelas.notificacao_popup_vistos = [];
  db.tabelas.aviso_eventos_canais = [
    { evento: EVENTO, canal: "sino", ativo: op.sinoLigado ?? true },
    ...(op.popupLigado === false ? [] : [{ evento: EVENTO, canal: "popup", ativo: true }]),
  ];
  db.tabelas.aviso_destinatarios = (op.destinatarios === undefined ? ["u-dir"] : op.destinatarios ?? []).map((u, i) => ({
    id: `d${i}`, evento: EVENTO, canal: "sino", tipo_destinatario: "usuario", usuario_id: u, email: null, nome: null, ativo: true,
  }));
  return db;
}
// Saldo inicial já informado pela contabilidade (sem isso, quem já tem período terminado fica "Saldo inicial pendente" e não é avisado).
const confirmarSaldo = (db: any, ...ks: number[]) => { for (const k of ks) db.tabelas.ferias_config.push({ funcionario_id: id(k), saldo_inicial_confirmado_em: "2026-01-01T12:00:00.000Z", saldo_inicial_quitado_ate: null }); };
// O mock do Supabase do harness lê globalThis.__DB__ (o cenário mais recente); cada chamada aponta para o banco do teste em curso.
const { createServiceClient } = await importar("scripts/harness-mot/mocks/supabase-server.mjs");
const svcDe = (db: any) => { (globalThis as any).__DB__ = db; return createServiceClient(); };

// created_at é DEFAULT now() no banco real; o banco em memória não tem esse default, então o teste o preenche com o instante do envio.
const rodar = async (db: any, dia = HOJE, opcoes: { lembreteDias?: number } = {}) => {
  const r = await LIB.executarAvisosFerias(svcDe(db), dia, agoraDe(dia), opcoes);
  for (const x of db.tabelas.notificacoes_analista) x.created_at ??= agoraDe(dia).toISOString();
  return r;
};
const periodosDe = (db: any, k: number) => db.tabelas.ferias_periodos.filter((p: any) => p.funcionario_id === id(k)).sort((a: any, b: any) => a.numero - b.numero);
const notifs = (db: any, user?: string) => db.tabelas.notificacoes_analista.filter((x: any) => !user || x.user_id === user);
// Registros dos marcos (90, 60, 30) como "x"/"-"; aviso_vencido_em (vencido e lembretes) é conferido à parte.
const colunas = (p: any) => [p.aviso_90_em ?? null, p.aviso_60_em ?? null, p.aviso_30_em ?? null].map((x) => (x ? "x" : "-")).join("");
const vencidoEm = (p: any): string | null => p.aviso_vencido_em ?? null;

// ═════════════════ FRONTEIRAS DOS MARCOS ═════════════════
await ok("fronteiras 91 / 90 / 61 / 60 / 31 / 30 / 0 e vencido: quem manda o quê e o que fica registrado (o marco enviado e os anteriores 'já vistos')", async () => {
  const casos: [number, number, string, RegExp | null][] = [
    // dias restantes, avisos enviados, registros (90,60,30), texto
    [91, 0, "---", null],
    [90, 1, "x--", /faltam 90 dia/],
    [61, 1, "x--", /faltam 61 dia/],
    [60, 1, "xx-", /faltam 60 dia/],
    [31, 1, "xx-", /faltam 31 dia/],
    [30, 1, "xxx", /faltam 30 dia/],
    [0, 1, "xxx", /vence hoje/],
    [-1, 1, "xx-", /VENCIDAS|passou há 1 dia/], // vencido: 90 e 60 viram "já vistos"; o de 30 não é tocado; o vencido tem coluna própria
  ];
  for (const [dias, enviados, regs, texto] of casos) {
    const db = cenario([[1, TERC, admissaoComLimite(limiteEm(dias))]]);
    confirmarSaldo(db, 1);
    const r = await rodar(db);
    assert.equal(r.avisosEnviados, enviados, `${dias} dias: enviados`);
    assert.equal(notifs(db).length, enviados, `${dias} dias: notificações`);
    const p1 = periodosDe(db, 1)[0];
    assert.equal(p1.data_limite, limiteEm(dias));
    assert.equal(colunas(p1), regs, `${dias} dias: registros`);
    assert.equal(vencidoEm(p1) !== null, dias < 0, `${dias} dias: aviso_vencido_em só no vencido`);
    if (texto) assert.match(notifs(db)[0].titulo + " " + notifs(db)[0].mensagem, texto, `${dias} dias: texto`);
  }
});

await ok("cada marco dispara UMA vez ao longo dos dias (90, 60, 30), depois o aviso de vencido e os lembretes semanais — sem repetir no meio", async () => {
  const L = limiteEm(100);
  const db = cenario([[1, TERC, admissaoComLimite(L)]]);
  confirmarSaldo(db, 1);
  const log: [number, number][] = [];
  for (let d = -100; d <= 25; d++) {
    const dia = adicionarDiasISO(L, d);
    const r = await rodar(db, dia);
    if (r.avisosEnviados) log.push([d, r.avisosEnviados]);
  }
  // d = dias em relação à data-limite: -90 (marco 90), -60, -30, +1 (vencido), +8, +15, +22 (lembretes semanais, contados do último carimbo)
  assert.deepEqual(log, [[-90, 1], [-60, 1], [-30, 1], [1, 1], [8, 1], [15, 1], [22, 1]]);
  const titulos = notifs(db).map((x: any) => x.titulo);
  assert.deepEqual(titulos.map((t: string) => t.split(" — ")[0]), ["Férias a vencer", "Férias a vencer", "Férias a vencer", "Férias VENCIDAS", "Lembrete: férias VENCIDAS", "Lembrete: férias VENCIDAS", "Lembrete: férias VENCIDAS"]);
});

await ok("execução dupla no mesmo dia não duplica (idempotente), nem com o cron rodando de novo horas depois", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(60))]]);
  confirmarSaldo(db, 1);
  assert.equal((await rodar(db)).avisosEnviados, 1);
  assert.equal((await rodar(db)).avisosEnviados, 0);
  assert.equal((await rodar(db)).avisosEnviados, 0);
  assert.equal(notifs(db).length, 1);
});

await ok("primeiro disparo atrasado (já a 20 dias): envia SÓ o marco de 30 e grava os de 90 e 60 como já vistos, sem enviá-los", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(20))]]);
  confirmarSaldo(db, 1);
  const r = await rodar(db);
  assert.deepEqual([r.avisosEnviados, r.marcos, notifs(db).length], [1, 1, 1]);
  assert.equal(colunas(periodosDe(db, 1)[0]), "xxx");
  assert.equal((await rodar(db, adicionarDiasISO(HOJE, 5))).avisosEnviados, 0, "nos dias seguintes nada mais sai até o vencimento");
});

await ok("período já vencido no primeiro disparo: UM aviso 'VENCIDAS' (risco de pagamento em dobro); nos dias seguintes nada; lembrete só depois de 7 dias; lembretes desligáveis (0)", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(-10))]]);
  confirmarSaldo(db, 1);
  const r = await rodar(db);
  assert.deepEqual([r.avisosEnviados, r.vencidos, r.lembretes], [1, 1, 0]);
  assert.match(notifs(db)[0].titulo, /^Férias VENCIDAS — /);
  assert.match(notifs(db)[0].mensagem, /passou há 10 dia\(s\).*pagamento em dobro/);
  assert.equal(colunas(periodosDe(db, 1)[0]), "xx-", "90 e 60 viram 'já vistos' sem enviar; o de 30 não é tocado");
  assert.ok(vencidoEm(periodosDe(db, 1)[0]), "o aviso de vencido fica em aviso_vencido_em");
  for (let d = 1; d <= 6; d++) assert.equal((await rodar(db, adicionarDiasISO(HOJE, d))).avisosEnviados, 0, `dia +${d}`);
  const lembrete = await rodar(db, adicionarDiasISO(HOJE, DIAS_LEMBRETE_VENCIDO));
  assert.deepEqual([lembrete.avisosEnviados, lembrete.lembretes], [1, 1]);
  assert.match(notifs(db)[1].titulo, /^Lembrete: férias VENCIDAS/);
  assert.equal((await rodar(db, adicionarDiasISO(HOJE, DIAS_LEMBRETE_VENCIDO + 1))).avisosEnviados, 0);

  const sem = cenario([[1, TERC, admissaoComLimite(limiteEm(-10))]]);
  confirmarSaldo(sem, 1);
  await rodar(sem, HOJE, { lembreteDias: 0 });
  for (const d of [7, 14, 30, 60]) assert.equal((await rodar(sem, adicionarDiasISO(HOJE, d), { lembreteDias: 0 })).avisosEnviados, 0, `sem lembrete, dia +${d}`);
  assert.equal(notifs(sem).length, 1, "só o aviso único");
});

// ═════════════════ GARANTIAS ═════════════════
await ok("falha no envio NÃO grava os registros (nem os 'já vistos'); no dia seguinte, com o envio funcionando, sai e marca", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(20))]]);
  confirmarSaldo(db, 1);
  db.falhas["notificacoes_analista.insert"] = "falha de rede simulada";
  const r = await rodar(db);
  assert.deepEqual([r.avisosEnviados, r.falhas], [0, 1]);
  assert.equal(colunas(periodosDe(db, 1)[0]), "---", "nenhum registro gravado");
  assert.equal(notifs(db).length, 0);
  delete db.falhas["notificacoes_analista.insert"];
  const depois = await rodar(db, adicionarDiasISO(HOJE, 1));
  assert.equal(depois.avisosEnviados, 1);
  assert.equal(colunas(periodosDe(db, 1)[0]), "xxx");
});

await ok("sem destinatário nada é enviado e NADA é marcado (nada se perde); quando alguém é configurado, o aviso pendente sai", async () => {
  for (const op of [{ destinatarios: [] as string[] }, { sinoLigado: false }] as Opcoes[]) {
    const db = cenario([[1, TERC, admissaoComLimite(limiteEm(45))]], op);
    confirmarSaldo(db, 1);
    const r = await rodar(db);
    assert.equal(r.avisosEnviados, 0);
    assert.equal(notifs(db).length, 0);
    assert.equal(colunas(periodosDe(db, 1)[0]), "---", "registros intactos");
    if (op.destinatarios) {
      assert.equal(r.semDestinatarios, 1);
      db.tabelas.aviso_destinatarios.push({ id: "novo", evento: EVENTO, canal: "sino", tipo_destinatario: "usuario", usuario_id: "u-dir", email: null, nome: null, ativo: true });
      const depois = await rodar(db, adicionarDiasISO(HOJE, 1));
      assert.equal(depois.avisosEnviados, 1, "o marco de 60 que ficou pendente sai quando há destinatário");
      assert.equal(colunas(periodosDe(db, 1)[0]), "xx-");
    }
  }
});

await ok("a lista do sino é por unidade: o supervisor só é avisado dos funcionários da própria unidade; sócios, de todas; vários destinatários = uma notificação cada", async () => {
  const db = cenario(
    [[1, TERC, admissaoComLimite(limiteEm(30))], [2, TERC, admissaoComLimite(limiteEm(30)), { unidade_id: "U2", cliente_id: "C3", empresa: "Cliente Tres" }]],
    { destinatarios: ["u-dir", "u-sup1", "u-sup2"] }
  );
  confirmarSaldo(db, 1, 2);
  const r = await rodar(db);
  assert.equal(r.avisosEnviados, 4);
  const por = (u: string) => notifs(db, u).map((x: any) => x.funcionario_id).sort();
  assert.deepEqual(por("u-dir"), [id(1), id(2)].sort());
  assert.deepEqual(por("u-sup1"), [id(1)]);
  assert.deepEqual(por("u-sup2"), [id(2)]);
  // Só quem atende a unidade conta: com apenas a sup1 na lista, o funcionário da U2 fica pendente e NÃO é marcado.
  const so1 = cenario([[2, TERC, admissaoComLimite(limiteEm(30)), { unidade_id: "U2", cliente_id: "C3", empresa: "Cliente Tres" }]], { destinatarios: ["u-sup1"] });
  confirmarSaldo(so1, 2);
  const r2 = await rodar(so1);
  assert.deepEqual([r2.avisosEnviados, r2.semDestinatarios, colunas(periodosDe(so1, 2)[0])], [0, 1, "---"]);
});

// ═════════════════ QUEM ENTRA / QUEM FICA DE FORA ═════════════════
await ok("saldo pendente, ainda não iniciou, sem data-base e data-base mudou: NÃO disparam (mesmo com prazo vencido)", async () => {
  const db = cenario([
    [1, TERC, admissaoComLimite(limiteEm(-10))], // saldo inicial NÃO confirmado e já há período terminado
    [2, TERC, dataMais(HOJE, 2)],
    [3, TERC, null],
    [4, TERC, admissaoComLimite(limiteEm(20))], // período guardado com outra data-base
  ]);
  confirmarSaldo(db, 4);
  // Gera os períodos do 4 com a data-base antiga e depois "corrige" a admissão no cadastro.
  await rodar(db);
  db.tabelas.notificacoes_analista = [];
  for (const p of db.tabelas.ferias_periodos) { p.aviso_90_em = p.aviso_60_em = p.aviso_30_em = p.aviso_vencido_em = null; }
  db.tabelas.funcionarios[3].data_admissao = adicionarDiasISO(db.tabelas.funcionarios[3].data_admissao, 3);
  const r = await rodar(db);
  assert.equal(r.avisosEnviados, 0);
  assert.equal(notifs(db).length, 0);
  assert.equal(db.tabelas.ferias_periodos.every((p: any) => colunas(p) === "---"), true, "nada marcado");
});

await ok("só entra ativo E (Terceirização OU efetivado): MOT sem efetivação, MOT desligado e R&S ficam fora; MOT efetivado entra", async () => {
  const efet = { efetivado_em: dataMais(HOJE, -30), efetivado_por: "u-dir" };
  const db = cenario([
    [1, MOT, admissaoComLimite(limiteEm(30))], [2, MOT, admissaoComLimite(limiteEm(30)), efet], [3, TERC, admissaoComLimite(limiteEm(30)), { status: "desligado" }],
    [4, "recrutamento_selecao", admissaoComLimite(limiteEm(30))], [5, TERC, admissaoComLimite(limiteEm(30))],
  ]);
  confirmarSaldo(db, 1, 2, 3, 4, 5);
  const r = await rodar(db);
  assert.equal(r.funcionarios, 2);
  assert.deepEqual([...new Set(notifs(db).map((x: any) => x.funcionario_id))].sort(), [id(2), id(5)].sort());
});

await ok("só períodos ainda NÃO gozados: o gozado (inclusive o quitado pelo saldo inicial) nunca avisa; o próximo período segue a sua própria data-limite", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(-100))]]); // o período 1 venceu há 100 dias; o 2 ainda tem 265 dias
  confirmarSaldo(db, 1);
  await rodar(db); // gera os períodos e avisa o vencido do 1
  const [p1, p2] = periodosDe(db, 1);
  assert.equal(notifs(db).length, 1, "só o período 1 (vencido) avisou; o 2 ainda está longe");
  Object.assign(p1, { situacao: "gozada", origem: "saldo_inicial", gozo_inicio: null, gozo_fim: null });
  db.tabelas.notificacoes_analista = [];
  const r = await rodar(db, adicionarDiasISO(HOJE, 30));
  assert.equal(r.avisosEnviados, 0, "período gozado não avisa");
  void p2;
});

await ok("situação programada PARA os avisos; no dia do início o cron a passa para em férias (não há aviso à toa); em gozo e gozada nunca avisam", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(45))]]);
  confirmarSaldo(db, 1);
  await rodar(db, adicionarDiasISO(HOJE, -60)); // gera os períodos (ainda sem aviso: 105 dias)
  const p1 = periodosDe(db, 1)[0];
  Object.assign(p1, { situacao: "programada", gozo_inicio: dataMais(HOJE, 20), gozo_fim: dataMais(HOJE, 40), aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null });
  assert.equal((await rodar(db)).avisosEnviados, 0, "programada com início no futuro: calada");
  assert.equal((await rodar(db, dataMais(HOJE, 19))).avisosEnviados, 0, "um dia antes do início");
  assert.equal(periodosDe(db, 1)[0].situacao, "programada", "um dia antes do início segue programada");
  const noDia = await rodar(db, dataMais(HOJE, 20));
  assert.deepEqual([noDia.avisosEnviados, noDia.mudancasAutomaticas, periodosDe(db, 1)[0].situacao], [0, 1, "em_gozo"], "no dia do início passa sozinha para em férias, sem aviso");
  const depois = await rodar(db, dataMais(HOJE, 21)); // antes da automação, a programada de início vencido voltava a avisar; agora já está em férias
  assert.deepEqual([depois.avisosEnviados, depois.mudancasAutomaticas, notifs(db).length], [0, 0, 0], "sem aviso duplicado nem falso depois da mudança");
  for (const situacao of ["em_gozo", "gozada"]) {
    const outro = cenario([[1, TERC, admissaoComLimite(limiteEm(20))]]);
    confirmarSaldo(outro, 1);
    await rodar(outro, adicionarDiasISO(HOJE, -60));
    Object.assign(periodosDe(outro, 1)[0], { situacao, gozo_inicio: dataMais(HOJE, -5), gozo_fim: dataMais(HOJE, 5), aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null });
    assert.equal((await rodar(outro)).avisosEnviados, 0, situacao);
    assert.equal((await rodar(outro, dataMais(HOJE, 40))).avisosEnviados, 0, `${situacao}: nem vencido`);
  }
});

await ok("programada com início vencido E período já vencido: a automação a passa para em férias ANTES dos avisos (nenhum aviso de vencido); programada com início futuro, mesmo vencida, fica calada", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(-3))], [2, TERC, admissaoComLimite(limiteEm(-3))]]);
  confirmarSaldo(db, 1, 2);
  await rodar(db, adicionarDiasISO(HOJE, -400)); // gera os períodos sem avisar (ainda não existiam períodos terminados... só gera)
  db.tabelas.notificacoes_analista = [];
  for (const p of db.tabelas.ferias_periodos) { p.aviso_90_em = p.aviso_60_em = p.aviso_30_em = p.aviso_vencido_em = null; }
  Object.assign(periodosDe(db, 1)[0], { situacao: "programada", gozo_inicio: dataMais(HOJE, -2), gozo_fim: dataMais(HOJE, 8) });
  Object.assign(periodosDe(db, 2)[0], { situacao: "programada", gozo_inicio: dataMais(HOJE, 5), gozo_fim: dataMais(HOJE, 15) });
  const r = await rodar(db);
  assert.deepEqual([r.vencidos, notifs(db).length, r.mudancasAutomaticas], [0, 0, 1]);
  assert.deepEqual([periodosDe(db, 1)[0].situacao, periodosDe(db, 2)[0].situacao], ["em_gozo", "programada"]);
  assert.equal((await rodar(db)).avisosEnviados, 0, "segue sem aviso");
});

// ═════════════════ CONTEÚDO DO AVISO ═════════════════
await ok("texto em português simples: nome, empresa, data-limite em dd/mm/aaaa e dias restantes; sem dado sensível; tipo e funcionário gravados para o sino e o popup", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(30)), { nome_completo: "ZZTEST Maria da Silva" }]]);
  confirmarSaldo(db, 1);
  await rodar(db);
  const x = notifs(db)[0];
  assert.equal(x.tipo, "ferias_vencimento");
  assert.equal(x.funcionario_id, id(1));
  assert.equal(x.user_id, "u-dir");
  assert.equal(x.titulo, "Férias a vencer — ZZTEST Maria da Silva");
  assert.equal(x.mensagem, "ZZTEST Maria da Silva (Cliente Um) precisa tirar as férias até 06/11/2026: faltam 30 dia(s). Programe com a contabilidade.");
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(x.titulo + x.mensagem), false, "sem data ISO");
  assert.equal(x.unidade_id, "U1");
  const venc = LIB.montarAvisoFerias({ tipo: "vencido", lembrete: false, marcarComoVistos: [] }, { nome: "Ana", empresa: "Cliente X", dataLimite: "2026-08-15", dias: -53 });
  assert.deepEqual(venc, {
    titulo: "Férias VENCIDAS — Ana",
    mensagem: "Ana (Cliente X): a data-limite para tirar as férias (15/08/2026) passou há 53 dia(s) e as férias não foram lançadas. Risco de pagamento em dobro. Programe com a contabilidade.",
  });
});

await ok("rótulos: os textos dos avisos (marco, vencido, lembrete) e do catálogo em Configurações > Avisos não usam 'gozo', 'gozada' nem 'saldo'; o tipo gravado segue ferias_vencimento", () => {
  const dados = { nome: "Ana", empresa: "Cliente X", dataLimite: "2026-08-15" };
  const textos = [
    LIB.montarAvisoFerias({ tipo: "marco", marco: 90, marcarComoVistos: [] }, { ...dados, dias: 90 }),
    LIB.montarAvisoFerias({ tipo: "marco", marco: 30, marcarComoVistos: [] }, { ...dados, dias: 0 }),
    LIB.montarAvisoFerias({ tipo: "vencido", lembrete: false, marcarComoVistos: [] }, { ...dados, dias: -3 }),
    LIB.montarAvisoFerias({ tipo: "vencido", lembrete: true, marcarComoVistos: [] }, { ...dados, dias: -10 }),
  ].flatMap((t: { titulo: string; mensagem: string }) => [t.titulo, t.mensagem]);
  for (const t of textos) assert.equal(/gozo|gozad|saldo/i.test(t), false, t);
  assert.equal(LIB.TIPO_NOTIFICACAO_FERIAS, "ferias_vencimento");
  const nota = NOTA_EVENTO[EVENTO];
  assert.equal(/gozo|gozad|saldo/i.test(nota), false, "texto do catálogo");
  assert.match(nota, /em férias ou tiradas/);
  assert.match(nota, /férias já quitadas informadas/);
});

await ok("vencido e lembretes usam aviso_vencido_em e NUNCA mexem em aviso_30_em (que fica só com o marco de 30 dias)", async () => {
  const L = limiteEm(40);
  const db = cenario([[1, TERC, admissaoComLimite(L)]]);
  confirmarSaldo(db, 1);
  await rodar(db, adicionarDiasISO(L, -30)); // marco de 30 enviado
  const marco30 = periodosDe(db, 1)[0].aviso_30_em;
  assert.ok(marco30);
  assert.equal(vencidoEm(periodosDe(db, 1)[0]), null);
  assert.equal((await rodar(db, adicionarDiasISO(L, 1))).vencidos, 1);
  const depoisVencido = periodosDe(db, 1)[0];
  assert.equal(depoisVencido.aviso_30_em, marco30, "aviso_30_em intacto");
  assert.equal(vencidoEm(depoisVencido), agoraDe(adicionarDiasISO(L, 1)).toISOString());
  assert.equal((await rodar(db, adicionarDiasISO(L, 2))).avisosEnviados, 0, "sem repetição diária");
  assert.equal((await rodar(db, adicionarDiasISO(L, 7))).avisosEnviados, 0, "6 dias depois do aviso: ainda não");
  const lembrete = await rodar(db, adicionarDiasISO(L, 8)); // 7 dias depois do aviso
  assert.deepEqual([lembrete.avisosEnviados, lembrete.lembretes], [1, 1]);
  assert.equal(vencidoEm(periodosDe(db, 1)[0]), agoraDe(adicionarDiasISO(L, 8)).toISOString(), "o lembrete atualiza o registro");
  assert.equal(periodosDe(db, 1)[0].aviso_30_em, marco30, "aviso_30_em continua intacto");
  assert.equal((await rodar(db, adicionarDiasISO(L, 14))).avisosEnviados, 0, "6 dias depois do lembrete");
  assert.equal((await rodar(db, adicionarDiasISO(L, 15))).lembretes, 1, "7 dias depois do lembrete");
  // Programar zera TODOS os registros, inclusive o do vencido (a rota de programar faz isso; aqui, o efeito sobre o cron).
  Object.assign(periodosDe(db, 1)[0], { situacao: "programada", gozo_inicio: adicionarDiasISO(L, 20), gozo_fim: adicionarDiasISO(L, 30), aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null });
  assert.equal((await rodar(db, adicionarDiasISO(L, 16))).avisosEnviados, 0, "programada com início futuro: calada");
  const volta = await rodar(db, adicionarDiasISO(L, 21));
  assert.deepEqual([volta.vencidos, volta.avisosEnviados, periodosDe(db, 1)[0].situacao], [0, 0, "em_gozo"], "início passou: a automação move para em férias, sem aviso de vencido");
});

await ok("SEM a coluna aviso_vencido_em no banco (migração pendente): o cron NÃO envia nada, NÃO marca nada e diz o motivo; a lista e a programação da aba respondem 'ainda não disponível'", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(20))], [2, TERC, admissaoComLimite(limiteEm(-10))]]);
  confirmarSaldo(db, 1, 2);
  await rodar(db, adicionarDiasISO(HOJE, -90)); // gera os períodos antes
  db.tabelas.notificacoes_analista = [];
  for (const p of db.tabelas.ferias_periodos) { p.aviso_90_em = p.aviso_60_em = p.aviso_30_em = p.aviso_vencido_em = null; } // zera o que a geração marcou
  db.falhas["ferias_periodos.select"] = { code: "42703", message: "column ferias_periodos.aviso_vencido_em does not exist" };
  const r = await rodar(db);
  assert.deepEqual([r.avisosEnviados, r.falhas], [0, 1]);
  assert.match(r.erro!, /Migração pendente: falta a coluna ferias_periodos\.aviso_vencido_em \(supabase\/migration_ferias_aviso_vencido\.sql\)\. Nada foi enviado nem marcado\./);
  assert.equal(notifs(db).length, 0);
  assert.equal(db.tabelas.ferias_periodos.every((p: any) => colunas(p) === "---" && !vencidoEm(p)), true, "nada marcado");
  const rota = await chamar(R.cron.GET, { headers: { authorization: "Bearer segredo-de-teste" } });
  assert.equal(rota.status, 503);
  assert.match(rota.corpo.erro, /aviso_vencido_em/);
  // PostgREST sem o schema novo (PGRST204) é o mesmo caso.
  db.falhas["ferias_periodos.select"] = { code: "PGRST204", message: "Could not find the 'aviso_vencido_em' column of 'ferias_periodos' in the schema cache" };
  assert.match((await rodar(db)).erro!, /Migração pendente: falta a coluna/);
  // Coluna aplicada depois: o aviso pendente sai normalmente (nada foi perdido).
  delete db.falhas["ferias_periodos.select"];
  const depois = await rodar(db);
  assert.equal(depois.avisosEnviados, 2, "marco de 30 (20 dias) e vencido");
});

// ═════════════════ ROTA DO CRON ═════════════════
await ok("rota do cron: exige o segredo (401 sem ele ou com outro) e responde o resumo; nunca quebra com tabela ausente", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(30))]]);
  confirmarSaldo(db, 1);
  logar(db, null);
  assert.equal((await chamar(R.cron.GET, { headers: {} })).status, 401);
  assert.equal((await chamar(R.cron.GET, { headers: { authorization: "Bearer errado" } })).status, 401);
  assert.equal(notifs(db).length, 0);
  const r = await chamar(R.cron.GET, { headers: { authorization: "Bearer segredo-de-teste" } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual([r.corpo.avisosEnviados, r.corpo.marcos, r.corpo.falhas], [1, 1, 0]);
  const de = await chamar(R.cron.GET, { headers: { authorization: "Bearer segredo-de-teste" } });
  assert.equal(de.corpo.avisosEnviados, 0, "segunda chamada no mesmo dia: idempotente");
  db.falhas["ferias_periodos.select"] = { code: "42P01", message: 'relation "public.ferias_periodos" does not exist' };
  const sem = await chamar(R.cron.GET, { headers: { authorization: "Bearer segredo-de-teste" } });
  assert.equal(sem.status, 503, "migração pendente: o cron falha de forma visível");
  assert.equal(sem.corpo.avisosEnviados, 0);
  assert.equal(sem.corpo.falhas, 1);
  assert.match(sem.corpo.erro, /Migração pendente: as tabelas de férias ainda não existem/);
});

// ═════════════════ POPUP ═════════════════
await ok("popup: só os avisos do próprio usuário, só com o canal popup ligado, uma vez por aviso (notificacao_popup_vistos); marcar visto ignora aviso alheio e outro tipo", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(30))]], { destinatarios: ["u-dir", "u-sup1"] });
  confirmarSaldo(db, 1);
  await rodar(db);
  const meu = notifs(db, "u-dir")[0];
  const alheio = notifs(db, "u-sup1")[0];
  db.tabelas.notificacoes_analista.push({ id: "outro-tipo", tipo: "aso_periodico_vencendo", titulo: "ASO", mensagem: "x", user_id: "u-dir", funcionario_id: id(1), created_at: new Date().toISOString() });

  logar(db, null);
  assert.equal((await chamar(R.popup.GET)).status, 401);
  logar(db, "dir");
  const a = await chamar(R.popup.GET);
  assert.equal(a.status, 200);
  assert.deepEqual(a.corpo.data.map((i: any) => i.id), [meu.id], "só o meu aviso de férias");
  assert.equal(a.corpo.temNovas, true);
  assert.equal(a.corpo.data[0].funcionarioId, id(1));

  // Marcar visto: ignora o id do outro usuário e o de outro tipo.
  const v = await chamar(R.visto.POST, { metodo: "POST", corpo: { ids: [meu.id, alheio.id, "outro-tipo", "nao-e-uuid"] } });
  assert.equal(v.status, 200);
  assert.deepEqual(db.tabelas.notificacao_popup_vistos.map((x: any) => [x.notificacao_id, x.user_id]), [[meu.id, "u-dir"]]);
  const b = await chamar(R.popup.GET);
  assert.deepEqual([b.corpo.data, b.corpo.temNovas], [[], false], "uma vez por aviso");
  logar(db, "sup1");
  assert.equal((await chamar(R.popup.GET)).corpo.data.length, 1, "o aviso do outro usuário continua novo para ele");
  // Aviso novo (outro marco) volta a abrir; canal popup desligado ou sem linha: nunca abre.
  logar(db, "dir");
  await rodar(db, adicionarDiasISO(HOJE, 5));
  db.tabelas.notificacoes_analista.push({ id: "novo", tipo: "ferias_vencimento", titulo: "Férias a vencer — X", mensagem: "m", user_id: "u-dir", funcionario_id: id(1), created_at: new Date().toISOString() });
  assert.deepEqual((await chamar(R.popup.GET)).corpo.data.map((i: any) => i.id), ["novo"]);
  db.tabelas.aviso_eventos_canais.find((c: any) => c.canal === "popup").ativo = false;
  assert.deepEqual((await chamar(R.popup.GET)).corpo.data, [], "canal popup desligado");
  db.tabelas.aviso_eventos_canais = db.tabelas.aviso_eventos_canais.filter((c: any) => c.canal !== "popup");
  assert.deepEqual((await chamar(R.popup.GET)).corpo.data, [], "sem linha do canal popup");
});

await ok("popup: só avisos recentes (14 dias) e nunca quebra o painel quando a tabela de 'vistos' falha", async () => {
  const db = cenario([[1, TERC, admissaoComLimite(limiteEm(30))]]);
  db.tabelas.notificacoes_analista.push(
    { id: "velho", tipo: "ferias_vencimento", titulo: "Férias a vencer — Velho", mensagem: "m", user_id: "u-dir", funcionario_id: id(1), created_at: new Date(Date.now() - 20 * 86400000).toISOString() },
    { id: "novo", tipo: "ferias_vencimento", titulo: "Férias a vencer — Novo", mensagem: "m", user_id: "u-dir", funcionario_id: id(1), created_at: new Date().toISOString() }
  );
  logar(db, "dir");
  assert.deepEqual((await chamar(R.popup.GET)).corpo.data.map((i: any) => i.id), ["novo"]);
  db.falhas["notificacao_popup_vistos.select"] = "falha";
  const r = await chamar(R.popup.GET);
  assert.deepEqual([r.status, r.corpo.data, r.corpo.temNovas], [200, [], false]);
});

// ═════════════════ CATÁLOGO, CRON E ARQUIVOS ═════════════════
await ok("catálogo de avisos: grupo 'ferias' com o evento ferias_vencimento (sino e popup), popup só interruptor, sino com lista obrigatória; aparece em Configurações > Avisos", () => {
  assert.equal(grupoDoEvento(EVENTO), "ferias");
  assert.deepEqual(EVENTOS_POR_GRUPO.ferias, [EVENTO]);
  assert.equal(ROTULO_GRUPO.ferias, "Férias");
  assert.match(ROTULO_EVENTO[EVENTO], /Férias a vencer/);
  assert.deepEqual([...canaisDoEvento(EVENTO)], ["sino", "popup"]);
  assert.deepEqual([canalSoInterruptor(EVENTO, "popup"), canalSoInterruptor(EVENTO, "sino")], [true, false]);
  assert.deepEqual([canalSemListaPermitido(EVENTO, "popup"), canalSemListaPermitido(EVENTO, "sino")], [true, false], "sino exige alguém na lista (sem padrão do sistema)");
  assert.deepEqual([ligadoSemLinha(EVENTO, "sino"), ligadoSemLinha(EVENTO, "popup")], [true, false]);
  assert.match(fs.readFileSync("src/components/AvisosConfigClient.tsx", "utf8"), /const GRUPOS: GrupoAviso\[\] = \[[^\]]*"ferias"/);
  // Os mesmos canais que a migration já aplicada registrou no banco.
  const sql = fs.readFileSync("supabase/migration_ferias_aviso.sql", "utf8");
  assert.match(sql, /\('ferias_vencimento', 'ferias', '[^']+', array\['sino', 'popup'\]\)/);
});

await ok("migration do aviso de vencido: PEQUENA e idempotente (uma coluna timestamptz nula, comentada), sem default, índice, policy ou backfill", () => {
  const sql = fs.readFileSync("supabase/migration_ferias_aviso_vencido.sql", "utf8");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(codigo, /alter table public\.ferias_periodos add column if not exists aviso_vencido_em timestamptz;/);
  assert.match(codigo, /comment on column public\.ferias_periodos\.aviso_vencido_em is/);
  assert.equal((codigo.match(/alter table/gi) ?? []).length, 1);
  assert.equal(/\b(default|index|policy|update|insert|delete|drop)\b/i.test(codigo), false, "só a coluna e o comentário");
});

await ok("vercel.json: UM cron novo por dia (09:00 UTC, como os demais) em /api/cron/ferias-avisos; o cron de ASO e os outros ficam intactos", () => {
  const crons: { path: string; schedule: string }[] = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons;
  const ferias = crons.filter((c) => c.path === "/api/cron/ferias-avisos");
  assert.deepEqual(ferias, [{ path: "/api/cron/ferias-avisos", schedule: "0 9 * * *" }]);
  assert.deepEqual(crons.find((c) => c.path === "/api/cron/lembrete-vencimento-aso"), { path: "/api/cron/lembrete-vencimento-aso", schedule: "0 9 * * *" });
  assert.equal(crons.every((c) => c.schedule === "0 9 * * *"), true, "todos diários");
});

await ok("o aviso não toca no ASO: o cron e o disparo de ASO não mencionam férias, e o aviso de férias não importa nada de ASO", () => {
  const aso = ["src/app/api/cron/lembrete-vencimento-aso/route.ts", "src/lib/dispararAvisoAsoPeriodico.ts"].map((f) => fs.readFileSync(f, "utf8")).join("\n");
  assert.equal(/f[eé]rias/i.test(aso), false);
  assert.equal(/dispararAvisoAso|asoStatus|funcionario_asos/.test(fs.readFileSync("src/lib/feriasAvisos.ts", "utf8")), false);
});

console.log(`\n${n} verificações dos avisos de férias passaram.`);
