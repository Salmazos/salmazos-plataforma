// Comissão — AVISOS (rede de segurança contra lançamento esquecido): sino à diretoria a cada marcação, pendências (popup) do beneficiário e da
// diretoria, e o cron diário de sinos sem duplicar. Rotas e serviço rodam contra o banco em memória do harness.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-comissao-avisos.mts
import assert from "node:assert/strict";
import fs from "node:fs";
// @ts-expect-error módulo .mjs do harness, sem tipos
import { congelarData, logar, importar, chamar, novoDb, usuario, USUARIOS } from "./harness-mot/ambiente.mjs";
import {
  janelaDeLembrete, competenciaFechavel, textosSino, diasNoMes, TIPO_SINO_COMISSAO, COMISSAO_CONTROLE_INICIO, competenciaNoControle, definirInicioDoControleParaTeste,
} from "../src/lib/comissaoPendenciasRegras";

congelarData(); // 07/10/2026 15:00Z
// Os cenários 1 a 6 usam cobranças de OUTUBRO (antes do go-live real, 2026-11); para elas valerem, o início do controle é recuado. A seção 7 volta ao valor real.
definirInicioDoControleParaTeste("2000-01-01");
process.env.CRON_SECRET = "segredo-de-teste";
const R = {
  marcar: await importar("src/app/api/comissoes/marcar/route.ts"),
  pendencias: await importar("src/app/api/comissoes/pendencias/route.ts"),
  cron: await importar("src/app/api/cron/comissao-pendencias/route.ts"),
};
let n = 0;
const ok = async (nome: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`OK ${nome}`); };
const em = async (iso: string, fn: () => void | Promise<void>) => { congelarData(iso); try { await fn(); } finally { congelarData(); } };

USUARIOS.gio = usuario("u-gio", "analista");
USUARIOS.reb = usuario("u-reb", "analista");
USUARIOS.outra = usuario("u-out", "analista");
USUARIOS.dir2 = usuario("u-dir2", "diretoria"); // diretoria só da unidade U2

const ID = (k: number) => `cccccccc-0000-4000-8000-${String(k).padStart(12, "0")}`;
const BEN_GIO = ID(901), BEN_REB = ID(902), P_GIO = ID(951), P_REB = ID(952), P_OUT = ID(953);
const V_GIO = ID(801), V_REB = ID(802);
const DIA2 = "2026-11-02T15:00:00Z", DIA3_2359 = "2026-11-04T02:59:00Z", DIA4 = "2026-11-04T15:00:00Z", DIA10 = "2026-11-10T15:00:00Z", OUT29 = "2026-10-29T15:00:00Z";
let seq = 100;

function cenario() {
  const db = novoDb(); logar(db, "gio");
  const perfil = (u: string, nome: string, id: string, unidade = "U1") => ({ id, user_id: u, unidade_id: unidade, acesso_todas_unidades: false, ativo: true, nome_completo: nome, nivel_acesso: "analista" });
  db.tabelas.analistas_perfil.push(perfil("u-gio", "Giovanni Prado", P_GIO), perfil("u-reb", "Rebecca Zambonini", P_REB), perfil("u-out", "Outra Analista", P_OUT));
  db.tabelas.analistas_perfil.find((p: any) => p.user_id === "u-dir").nivel_acesso = "diretoria";
  db.tabelas.analistas_perfil.push({ ...perfil("u-dir2", "Diretora SBC", ID(960), "U2"), nivel_acesso: "diretoria" });
  db.tabelas.unidades = [{ id: "U1", slug: "monte-mor-hortolandia" }, { id: "U2", slug: "sbc" }];
  db.tabelas.comissao_beneficiarios = [
    { id: BEN_GIO, analista_perfil_id: P_GIO, percentual: 5, ativo: true, unidade_id: "U1" },
    { id: BEN_REB, analista_perfil_id: P_REB, percentual: 5, ativo: true, unidade_id: "U1" },
  ];
  db.tabelas.comissao_lancamentos = []; db.tabelas.comissao_fechamentos = []; db.tabelas.notificacoes_analista = [];
  db.tabelas.cobranca_rs_analistas_acesso = [];
  db.tabelas.vagas = [
    { id: V_GIO, titulo: "Analista Fiscal", responsavel: "Giovanni Prado", unidade_id: "U1", reposicao_de_candidato_vaga_id: null },
    { id: V_REB, titulo: "Auxiliar", responsavel: "Rebecca Zambonini", unidade_id: "U1", reposicao_de_candidato_vaga_id: null },
  ];
  db.tabelas.cobrancas_rs = []; db.tabelas.contas_receber_hortolandia = []; db.tabelas.candidatos_vagas = []; db.tabelas.audit_logs = [];
  return db;
}
function cobranca(db: any, extra: Record<string, unknown> = {}): string {
  const id = (extra.id as string) ?? ID(++seq);
  db.tabelas.cobrancas_rs.push({
    id, tipo: "contratacao", status: "aprovada_enviada", salario: 1000, fee_percentual: 40, fee_valor: 400, vaga_id: V_GIO, enviado_em: "2026-10-05T15:00:00.000Z",
    gerado_por_user_id: "u-gio", data_vencimento: null, unidade_id: "U1", revisado_por: "u-dir", cliente_nome_snapshot: `Cliente ${id.slice(-3)}`, candidato_nome_snapshot: "Joao", cargo: "Fiscal", ...extra,
  });
  return id;
}
const lanc = (db: any, extra: Record<string, unknown> = {}) => {
  const l = { id: ID(++seq), cobranca_id: (extra.cobranca_id as string) ?? cobranca(db), beneficiario_id: BEN_GIO, tipo: "comissao", status: "confirmada", competencia: "2026-10-01", base_valor: 400, percentual_aplicado: 5, valor_comissao: 20, lancamento_origem_id: null, motivo: null, marcado_por: "u-gio", unidade_id: "U1", fechado_em: null, fechamento_id: null, marcado_em: "2026-10-10T12:00:00.000Z", ...extra };
  db.tabelas.comissao_lancamentos.push(l); return l;
};
const sinos = (db: any, filtro: (s: any) => boolean = () => true) => db.tabelas.notificacoes_analista.filter(filtro);
const pend = async (db: any, quem: string) => { logar(db, quem); return (await chamar(R.pendencias.GET)).corpo; };
const cron = (headers: Record<string, string> = { authorization: "Bearer segredo-de-teste" }) => chamar(R.cron.GET, { headers });

// ── 1) Regras puras ──
await ok("janela do lembrete: últimos 3 dias do mês e dias 1–3 (dia 3 = último dia); fora disso nada; fevereiro tem 28 dias", () => {
  const j = (iso: string) => janelaDeLembrete(new Date(iso));
  assert.equal(j("2026-10-28T15:00:00Z"), null);
  assert.deepEqual(j(OUT29), { fase: "aviso", competencia: "2026-10-01", diasRestantes: 5, ultimoDia: false, prazoAte: "2026-11-03" });
  assert.deepEqual(j("2026-10-31T20:30:00Z"), { fase: "aviso", competencia: "2026-10-01", diasRestantes: 3, ultimoDia: false, prazoAte: "2026-11-03" });
  assert.deepEqual(j(DIA2), { fase: "prazo", competencia: "2026-10-01", diasRestantes: 1, ultimoDia: false, prazoAte: "2026-11-03" });
  assert.deepEqual(j(DIA3_2359), { fase: "prazo", competencia: "2026-10-01", diasRestantes: 0, ultimoDia: true, prazoAte: "2026-11-03" });
  assert.equal(j(DIA4), null);
  assert.equal(diasNoMes("2027-02-01"), 28); assert.equal(j("2027-02-25T15:00:00Z"), null); assert.equal(j("2027-02-26T15:00:00Z")?.fase, "aviso");
  assert.deepEqual(j("2027-01-02T15:00:00Z"), { fase: "prazo", competencia: "2026-12-01", diasRestantes: 1, ultimoDia: false, prazoAte: "2027-01-03" }, "virada de ano");
});
await ok("mês que já pode fechar: dia 4 em diante o anterior; dias 1–3 o anterior ao anterior", () => {
  assert.equal(competenciaFechavel(new Date(DIA3_2359)), "2026-09-01");
  assert.equal(competenciaFechavel(new Date(DIA4)), "2026-10-01");
  assert.equal(competenciaFechavel(new Date("2027-01-04T15:00:00Z")), "2026-12-01");
});
await ok("textos: só o necessário (cliente, valor, mês, prazo), sem dado fiscal; último dia destacado", () => {
  const j = janelaDeLembrete(new Date(DIA3_2359))!;
  assert.match(textosSino.lembreteLancamento({ qtd: 2, janela: j }).mensagem, /2 cobranças suas de outubro\/2026 estão sem comissão marcada\. Prazo até 03\/11\/2026 \(HOJE é o último dia\)/);
  assert.equal(textosSino.lembreteLancamento({ qtd: 1, janela: j }).titulo, "💰 Último dia para lançar suas comissões");
  assert.match(textosSino.marcada({ beneficiario: "Giovanni", cliente: "Cliente X", valor: 50, competencia: "2026-10-01", folga: true }).mensagem, /Giovanni marcou a comissão de Cliente X.*outubro\/2026.*folga/);
  assert.equal(textosSino.marcada({ beneficiario: "G", cliente: "X", valor: 1, competencia: "2026-10-01", folga: false }).titulo, "💰 Comissão marcada");
});

// ── 2) Marcou => diretoria é avisada na hora ──
await ok("marcar comissão avisa a diretoria da unidade por sino (não o beneficiário, não outra unidade, não analista) e o clique leva a Comissões", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-10-05T15:00:00.000Z" });
  assert.equal((await chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id: c } })).status, 201);
  const s = sinos(db);
  assert.deepEqual(s.map((x: any) => [x.user_id, x.tipo, x.unidade_id]), [["u-dir", "comissao_diretoria_marcada", "U1"]]);
  assert.match(s[0].mensagem, /Giovanni Prado marcou a comissão de Cliente .*\(R\$\s20,00\), competência outubro\/2026\./);
  assert.equal(/folga/.test(s[0].mensagem), false);
  const prov = fs.readFileSync("src/components/NotificacoesProvider.tsx", "utf8");
  assert.ok(prov.indexOf('startsWith("comissao_diretoria_")') < prov.indexOf('startsWith("comissao_")'), "diretoria antes do genérico");
  assert.ok(prov.includes('router.push("/painel/comissoes")'));
});
await ok("marcada na folga (cobrança de 31/10 marcada em 02/11) vem destacada para a diretoria; se quem marcou é a própria diretoria, ela não se auto-avisa", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-10-31T20:30:00Z" });
  await em(DIA2, async () => { assert.equal((await chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id: c } })).status, 201); });
  const s = sinos(db);
  assert.equal(s.length, 1); assert.equal(s[0].titulo, "💰 Comissão lançada na folga"); assert.match(s[0].mensagem, /lançada depois do fim do mês \(folga até o dia 3\)/);
});
await ok("marcação recusada (fora do prazo) não gera sino", async () => {
  const db = cenario(); const c = cobranca(db, { enviado_em: "2026-10-31T20:30:00Z" });
  await em(DIA4, async () => { assert.equal((await chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id: c } })).status, 409); });
  assert.equal(sinos(db).length, 0);
});

// ── 3) Pendências do beneficiário (popup) ──
await ok("beneficiário: só cobranças SUAS sem comissão (gerou ou é o responsável da vaga), nunca as de outro analista; some ao marcar; contestadas contam", async () => {
  const db = cenario();
  const minha = cobranca(db, { gerado_por_user_id: "u-gio", vaga_id: V_REB });
  const porResp = cobranca(db, { gerado_por_user_id: "u-reb", vaga_id: V_GIO });
  cobranca(db, { gerado_por_user_id: "u-reb", vaga_id: V_REB, cliente_nome_snapshot: "Cliente Rebecca" });
  cobranca(db, { gerado_por_user_id: "u-gio", status: "cancelada" });
  cobranca(db, { gerado_por_user_id: "u-gio", status: "pendente_revisao", enviado_em: null });
  const p = await pend(db, "gio");
  assert.deepEqual(p.beneficiario.a_lancar.map((x: any) => x.id).sort(), [minha, porResp].sort());
  assert.equal(JSON.stringify(p).includes("Cliente Rebecca"), false, "não vaza cobrança de outro analista");
  assert.equal(p.beneficiario.a_lancar[0].comissao_prevista, 20);
  assert.equal(p.diretoria, null);
  assert.equal((await chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id: minha } })).status, 201);
  assert.deepEqual((await pend(db, "gio")).beneficiario.a_lancar.map((x: any) => x.id), [porResp]);
  lanc(db, { status: "contestada", cobranca_id: porResp }); // contestada ainda é comissão ativa: a cobrança sai da lista e entra o aviso de contestação
  const p2 = (await pend(db, "gio")).beneficiario;
  assert.deepEqual([p2.a_lancar.length, p2.contestadas], [0, 1]);
});
await ok("dentro da folga o mês anterior entra na lista (e a janela vem junto); fora dela (dia 10) só o mês corrente", async () => {
  const db = cenario(); const out31 = cobranca(db, { enviado_em: "2026-10-31T20:30:00Z" }); const nov2 = cobranca(db, { enviado_em: "2026-11-02T11:00:00Z" });
  await em(DIA2, async () => { const p = (await pend(db, "gio")).beneficiario; assert.deepEqual(p.a_lancar.map((x: any) => x.id).sort(), [out31, nov2].sort()); assert.equal(p.janela.fase, "prazo"); });
  await em(DIA10, async () => { const p = (await pend(db, "gio")).beneficiario; assert.deepEqual(p.a_lancar.map((x: any) => x.id), [nov2]); assert.equal(p.janela, null); });
});
await ok("acesso: sem login 401; analista que não é beneficiário nem diretoria recebe tudo nulo", async () => {
  const db = cenario(); logar(db, null);
  assert.equal((await chamar(R.pendencias.GET)).status, 401);
  const p = await pend(db, "outra"); assert.deepEqual(p, { beneficiario: null, diretoria: null });
});

// ── 4) Pendências da diretoria ──
await ok("diretoria: contestações paradas (com a mais antiga) e fechamento sem pagamento (dias desde o fechamento)", async () => {
  const db = cenario();
  lanc(db, { status: "contestada", contestado_em: "2026-10-12T12:00:00Z" }); lanc(db, { status: "contestada", contestado_em: "2026-10-20T12:00:00Z" });
  db.tabelas.comissao_fechamentos.push({ id: ID(990), competencia: "2026-09-01", unidade_id: "U1", total: 100, qtd_lancamentos: 3, fechado_em: "2026-10-05T13:00:00Z", pago_em: null });
  db.tabelas.comissao_fechamentos.push({ id: ID(991), competencia: "2026-08-01", unidade_id: "U1", total: 50, qtd_lancamentos: 1, fechado_em: "2026-09-05T13:00:00Z", pago_em: "2026-09-08" });
  await em(DIA10, async () => {
    const d = (await pend(db, "dir")).diretoria;
    assert.deepEqual(d.contestadas, { qtd: 2, mais_antiga_em: "2026-10-12T12:00:00Z" });
    assert.deepEqual(d.pagamento.map((p: any) => [p.competencia, p.total, p.dias]), [["2026-09-01", 100, 36]], "o fechamento já pago não aparece");
  });
});
await ok("fechamento liberado: só depois do prazo (dia 4), por unidade, com quantidade/total/bloqueios; some quando fecha; mês com fechamento posterior não é pendência", async () => {
  const db = cenario(); lanc(db); lanc(db, { valor_comissao: 30 }); lanc(db, { status: "contestada" }); lanc(db, { competencia: "2026-11-01" });
  await em(DIA3_2359, async () => { assert.equal((await pend(db, "dir")).diretoria.fechamento, null, "dia 3 ainda é prazo de lançamento"); });
  await em(DIA4, async () => {
    const f = (await pend(db, "dir")).diretoria.fechamento;
    assert.deepEqual([f.competencia, f.unidades.length, f.unidades[0].unidade, f.unidades[0].qtd, f.unidades[0].total, f.unidades[0].bloqueios], ["2026-10-01", 1, "monte-mor-hortolandia", 2, 50, 1]);
    db.tabelas.comissao_fechamentos.push({ id: ID(992), competencia: "2026-10-01", unidade_id: "U1", total: 50, qtd_lancamentos: 2, fechado_em: DIA4, pago_em: null });
    for (const l of db.tabelas.comissao_lancamentos) if (l.status === "confirmada" && l.competencia === "2026-10-01") { l.fechamento_id = ID(992); l.fechado_em = DIA4; }
    assert.equal((await pend(db, "dir")).diretoria.fechamento, null, "fechado: não é mais pendência");
  });
});
await ok("fechamento liberado NÃO avisa quando o mês não tem nada a fechar (sem lançamento, só de outro mês, só prevista/cancelada/recusada, só contestada ou já fechado): nem sino nem popup", async () => {
  const semAviso = async (db: any, motivo: string) => {
    await em(DIA10, async () => {
      assert.equal((await pend(db, "dir")).diretoria.fechamento, null, `popup: ${motivo}`);
      logar(db, "dir"); db.tabelas.notificacoes_analista = [];
      assert.equal((await cron()).status, 200);
      assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.diretoriaFechamento).length, 0, `sino: ${motivo}`);
    });
  };
  await semAviso(cenario(), "banco sem nenhum lançamento");
  const outroMes = cenario(); lanc(outroMes, { competencia: "2026-11-01" }); lanc(outroMes, { competencia: "2026-09-01", fechamento_id: ID(970), fechado_em: "2026-10-05T13:00:00Z" });
  outroMes.tabelas.comissao_fechamentos.push({ id: ID(970), competencia: "2026-09-01", unidade_id: "U1", total: 20, qtd_lancamentos: 1, fechado_em: "2026-10-05T13:00:00Z", pago_em: "2026-10-06" });
  await semAviso(outroMes, "só novembro (corrente) e setembro já fechado");
  const naoConfirmadas = cenario(); for (const st of ["prevista", "cancelada", "recusada"]) lanc(naoConfirmadas, { status: st });
  await semAviso(naoConfirmadas, "outubro só com prevista/cancelada/recusada");
  const soContestada = cenario(); lanc(soContestada, { status: "contestada" });
  await semAviso(soContestada, "outubro só com contestada (bloqueio sem nada a fechar)");
  // e o contrário: com um confirmado, avisa (prova que o teste acima não passa por acaso)
  const comUm = cenario(); lanc(comUm);
  await em(DIA10, async () => { assert.equal((await pend(comUm, "dir")).diretoria.fechamento.unidades[0].qtd, 1); });
});
await ok("possível esquecimento: cobrança de BENEFICIÁRIO sem comissão depois do prazo aparece para a diretoria; dentro da folga, com comissão, de quem não é beneficiário, cancelada ou com o mês fechado, não", async () => {
  const db = cenario();
  const esquecida = cobranca(db, { enviado_em: "2026-10-20T12:00:00Z", cliente_nome_snapshot: "Cliente Esquecido" });
  const marcada = cobranca(db, { enviado_em: "2026-10-21T12:00:00Z" }); lanc(db, { cobranca_id: marcada, status: "prevista" });
  cobranca(db, { enviado_em: "2026-10-22T12:00:00Z", gerado_por_user_id: "u-out" }); // gerada por quem não é beneficiário
  cobranca(db, { enviado_em: "2026-10-23T12:00:00Z", status: "cancelada" });
  cobranca(db, { enviado_em: "2026-09-20T12:00:00Z" }); // setembro: fora do mês-alvo
  await em(DIA2, async () => { assert.equal((await pend(db, "dir")).diretoria.esquecidas, null, "dentro da folga ainda dá tempo"); });
  await em(DIA10, async () => {
    const e = (await pend(db, "dir")).diretoria.esquecidas;
    assert.deepEqual([e.competencia, e.itens.map((i: any) => [i.id, i.cliente, i.gerada_por])], ["2026-10-01", [[esquecida, "Cliente Esquecido", "Giovanni Prado"]]]);
    db.tabelas.comissao_fechamentos.push({ id: ID(993), competencia: "2026-10-01", unidade_id: "U1", total: 20, qtd_lancamentos: 1, fechado_em: DIA10, pago_em: "2026-11-10" });
    assert.equal((await pend(db, "dir")).diretoria.esquecidas, null, "mês já fechado: não há o que fazer pelo sistema");
  });
});
await ok("escopo por unidade: diretoria da unidade U2 não vê pendências da U1; analista beneficiário não recebe o bloco da diretoria", async () => {
  const db = cenario(); lanc(db, { status: "contestada" }); cobranca(db, { enviado_em: "2026-10-20T12:00:00Z" });
  await em(DIA10, async () => {
    const d1 = (await pend(db, "dir")).diretoria; assert.equal(d1.contestadas.qtd, 1); assert.ok(d1.esquecidas);
    const d2 = (await pend(db, "dir2")).diretoria; assert.deepEqual([d2.contestadas.qtd, d2.fechamento, d2.pagamento, d2.esquecidas], [0, null, [], null]);
    assert.equal((await pend(db, "gio")).diretoria, null);
  });
});

// ── 5) Cron diário ──
await ok("cron: sem o segredo 401; nos últimos dias do mês avisa o beneficiário só do que é DELE; rodar de novo no mesmo dia não duplica; no dia seguinte avisa de novo", async () => {
  const db = cenario(); logar(db, "dir");
  cobranca(db, { gerado_por_user_id: "u-gio", vaga_id: V_GIO }); cobranca(db, { gerado_por_user_id: "u-gio", vaga_id: V_GIO }); cobranca(db, { gerado_por_user_id: "u-reb", vaga_id: V_REB });
  assert.equal((await cron({})).status, 401); assert.equal((await cron({ authorization: "Bearer errado" })).status, 401);
  await em(OUT29, async () => {
    const r = await cron(); assert.equal(r.status, 200);
    const s = sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento);
    assert.deepEqual(s.map((x: any) => x.user_id).sort(), ["u-gio", "u-reb"]);
    assert.match(s.find((x: any) => x.user_id === "u-gio").mensagem, /2 cobranças suas de outubro\/2026.*Prazo até 03\/11\/2026 \(faltam 5 dias\)/);
    assert.match(s.find((x: any) => x.user_id === "u-reb").mensagem, /1 cobrança sua de outubro\/2026/);
    await cron(); assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento).length, 2, "mesmo dia: sem duplicar");
  });
  await em("2026-10-30T15:00:00Z", async () => { await cron(); assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento).length, 4, "dia seguinte: avisa de novo"); });
  await em("2026-11-03T15:00:00Z", async () => { await cron(); const u = sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento && /ÚLTIMO|último/i.test(x.titulo)); assert.equal(u.length, 2, "dia 3: último dia destacado"); });
});
await ok("cron fora da janela (dia 10) não manda lembrete ao beneficiário; ao marcar a cobrança o lembrete deixa de existir", async () => {
  const db = cenario(); const c = cobranca(db, { gerado_por_user_id: "u-gio" });
  await em(DIA10, async () => { await cron(); assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento).length, 0); });
  logar(db, "gio"); assert.equal((await chamar(R.marcar.POST, { metodo: "POST", corpo: { cobranca_id: c } })).status, 201);
  await em(OUT29, async () => { await cron(); assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento).length, 0, "nada pendente = nenhum aviso"); });
});
await ok("cron da diretoria (dia 10): contestações, fechamento liberado, fechamento sem pagamento e possível esquecimento — um sino de cada por dia, só para a diretoria da unidade", async () => {
  const db = cenario(); logar(db, "dir");
  lanc(db, { status: "contestada", contestado_em: "2026-10-12T12:00:00Z" }); lanc(db); cobranca(db, { enviado_em: "2026-10-20T12:00:00Z" });
  db.tabelas.comissao_fechamentos.push({ id: ID(994), competencia: "2026-08-01", unidade_id: "U1", total: 80, qtd_lancamentos: 2, fechado_em: "2026-09-05T13:00:00Z", pago_em: null });
  await em(DIA10, async () => {
    await cron();
    const doDir = sinos(db, (x: any) => x.tipo.startsWith("comissao_diretoria_"));
    assert.deepEqual(doDir.map((x: any) => x.tipo).sort(), [TIPO_SINO_COMISSAO.diretoriaContestadas, TIPO_SINO_COMISSAO.diretoriaEsquecidas, TIPO_SINO_COMISSAO.diretoriaFechamento, TIPO_SINO_COMISSAO.diretoriaPagamento].sort());
    assert.ok(doDir.every((x: any) => x.user_id === "u-dir" && x.unidade_id === "U1"), "dir2 (U2) e analistas não recebem");
    assert.match(doDir.find((x: any) => x.tipo === TIPO_SINO_COMISSAO.diretoriaFechamento).mensagem, /prazo de lançamento de outubro\/2026 terminou: 1 lançamento confirmado \(R\$\s20,00\) aguarda o fechamento/);
    assert.match(doDir.find((x: any) => x.tipo === TIPO_SINO_COMISSAO.diretoriaPagamento).mensagem, /agosto\/2026 \(R\$\s80,00\).*há 66 dias/);
    await cron(); assert.equal(sinos(db, (x: any) => x.tipo.startsWith("comissao_diretoria_")).length, 4, "segunda execução no dia: sem duplicar");
  });
  await em("2026-11-11T15:00:00Z", async () => { await cron(); assert.equal(sinos(db, (x: any) => x.tipo.startsWith("comissao_diretoria_")).length, 8, "enquanto a pendência existir, avisa todo dia"); });
});
await ok("sem pendência nenhuma, o cron não manda nada", async () => {
  const db = cenario(); logar(db, "dir");
  await em(DIA10, async () => { const r = await cron(); assert.equal(r.status, 200); assert.equal(sinos(db).length, 0); });
});

// ── 6) Fiação ──
await ok("fiação: popup montado só para quem tem acesso às comissões, cron agendado, tela com os 4 itens da diretoria", () => {
  const layout = fs.readFileSync("src/app/painel/layout.tsx", "utf8");
  assert.ok(layout.includes("PopupComissoesPendencias") && layout.includes("acessoComissoes.minhas || acessoComissoes.diretoria"));
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.ok(vercel.crons.some((c: any) => c.path === "/api/cron/comissao-pendencias"));
  const popup = fs.readFileSync("src/components/comissao/PopupComissoesPendencias.tsx", "utf8");
  for (const t of ["Para você lançar", "Para a diretoria", "sem comissão marcada", "sem pagamento há", "liberado", "contestada", "/painel/minhas-comissoes", "/painel/comissoes", "sessionStorage"]) assert.ok(popup.includes(t), t);
});

// ── 7) Início do controle no sistema: cobrança anterior ao go-live nunca entra no aviso "sem comissão marcada" ──
const MES_FIM = "2026-12-10T15:00:00Z"; // novembro já passou do prazo (dia 10), outubro idem
await ok("constante única do início do controle: 2026-11-01; competência anterior fica de fora, a partir dela entra (limite no fuso de Brasília)", () => {
  definirInicioDoControleParaTeste(null);
  assert.equal(COMISSAO_CONTROLE_INICIO, "2026-11-01");
  assert.equal(competenciaNoControle("2026-10-01"), false);
  assert.equal(competenciaNoControle("2026-11-01"), true);
  assert.equal(competenciaNoControle("2027-01-01"), true);
});
await ok("diretoria: cobrança de OUTUBRO sem comissão não é possível esquecimento (popup e sino); a de NOVEMBRO sem comissão depois do prazo é", async () => {
  definirInicioDoControleParaTeste(null);
  const db = cenario(); logar(db, "dir");
  cobranca(db, { enviado_em: "2026-10-20T12:00:00Z", cliente_nome_snapshot: "Cliente BioSafe" });
  cobranca(db, { enviado_em: "2026-10-31T23:30:00-03:00", cliente_nome_snapshot: "Cliente Rovensa" });
  await em("2026-11-10T15:00:00Z", async () => { // outubro: prazo terminou, mas é anterior ao controle
    assert.equal((await pend(db, "dir")).diretoria.esquecidas, null, "popup");
    await cron(); assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.diretoriaEsquecidas).length, 0, "sino");
  });
  const nov = cobranca(db, { enviado_em: "2026-11-05T12:00:00Z", cliente_nome_snapshot: "Cliente Novembro" });
  const nov1 = cobranca(db, { enviado_em: "2026-11-01T00:10:00-03:00", cliente_nome_snapshot: "Cliente Dia1" }); // 00:10 BRT do dia 1 = novembro
  await em(MES_FIM, async () => {
    const e = (await pend(db, "dir")).diretoria.esquecidas;
    assert.deepEqual([e.competencia, e.itens.map((i: any) => i.id).sort()], ["2026-11-01", [nov, nov1].sort()], "só novembro");
    assert.equal(JSON.stringify(e).includes("BioSafe") || JSON.stringify(e).includes("Rovensa"), false);
    await cron(); const s = sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.diretoriaEsquecidas);
    assert.equal(s.length, 1); assert.match(s[0].mensagem, /^2 cobranças de novembro\/2026,/);
  });
});
await ok("analista: cobrança de outubro sem comissão não vira lembrete nem popup (nem na folga de novembro); a de novembro vira", async () => {
  definirInicioDoControleParaTeste(null);
  const db = cenario();
  const out = cobranca(db, { enviado_em: "2026-10-31T20:30:00Z", gerado_por_user_id: "u-gio", vaga_id: V_GIO });
  await em(DIA2, async () => { // dias 1–3 de novembro: o mês anterior (outubro) ainda é marcável, mas não gera aviso
    const p = (await pend(db, "gio")).beneficiario; assert.deepEqual(p.a_lancar, [], "popup");
    logar(db, "dir"); await cron(); assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento).length, 0, "sino");
  });
  const nov = cobranca(db, { enviado_em: "2026-11-02T11:00:00Z", gerado_por_user_id: "u-gio", vaga_id: V_GIO });
  await em(DIA2, async () => {
    assert.deepEqual((await pend(db, "gio")).beneficiario.a_lancar.map((x: any) => x.id), [nov], "popup: novembro entra");
    logar(db, "dir"); await cron();
    assert.equal(sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento).length, 0, "nos dias 1–3 o lembrete mira outubro (fora do controle); o de novembro vem no fim do mês");
  });
  await em("2026-11-29T15:00:00Z", async () => { // últimos dias de novembro: lembrete do mês corrente, que está sob controle
    logar(db, "dir"); await cron();
    const s = sinos(db, (x: any) => x.tipo === TIPO_SINO_COMISSAO.lembreteLancamento);
    assert.equal(s.length, 1); assert.match(s[0].mensagem, /^1 cobrança sua de novembro\/2026 está sem comissão marcada\. Prazo até 03\/12\/2026/);
  });
  void out;
});
await ok("virada de ano: cobrança de dezembro/2026 sem comissão, em 10/01/2027, é possível esquecimento; a de outubro continua de fora", async () => {
  definirInicioDoControleParaTeste(null);
  const db = cenario(); logar(db, "dir");
  const dez = cobranca(db, { enviado_em: "2026-12-31T23:30:00-03:00" }); cobranca(db, { enviado_em: "2026-10-15T12:00:00Z" });
  await em("2027-01-10T15:00:00Z", async () => {
    const e = (await pend(db, "dir")).diretoria.esquecidas;
    assert.deepEqual([e.competencia, e.itens.map((i: any) => i.id)], ["2026-12-01", [dez]]);
  });
});
await ok("os demais avisos da diretoria NÃO dependem do início do controle: contestação, fechamento liberado e fechamento sem pagamento de outubro continuam", async () => {
  definirInicioDoControleParaTeste(null);
  const db = cenario();
  lanc(db, { status: "contestada", contestado_em: "2026-10-12T12:00:00Z" }); lanc(db);
  db.tabelas.comissao_fechamentos.push({ id: ID(995), competencia: "2026-08-01", unidade_id: "U1", total: 80, qtd_lancamentos: 2, fechado_em: "2026-09-05T13:00:00Z", pago_em: null });
  await em(DIA10, async () => {
    const d = (await pend(db, "dir")).diretoria;
    assert.equal(d.contestadas.qtd, 1); assert.equal(d.fechamento.unidades[0].qtd, 1); assert.equal(d.pagamento.length, 1);
    logar(db, "dir"); await cron();
    assert.deepEqual(sinos(db, (x: any) => x.tipo.startsWith("comissao_diretoria_")).map((x: any) => x.tipo).sort(), [TIPO_SINO_COMISSAO.diretoriaContestadas, TIPO_SINO_COMISSAO.diretoriaFechamento, TIPO_SINO_COMISSAO.diretoriaPagamento].sort());
  });
});
await ok("regra documentada: a constante é única e os avisos de 'sem comissão' passam por um ponto só", () => {
  const regras = fs.readFileSync("src/lib/comissaoPendenciasRegras.ts", "utf8");
  assert.equal((regras.match(/export const COMISSAO_CONTROLE_INICIO = /g) ?? []).length, 1);
  const serv = fs.readFileSync("src/lib/comissaoPendencias.ts", "utf8");
  assert.ok(serv.includes("competenciaNoControle") && serv.includes("o.competencias.filter(competenciaNoControle)"));
  definirInicioDoControleParaTeste("2000-01-01");
});

console.log(`\n${n} verificações OK`);
