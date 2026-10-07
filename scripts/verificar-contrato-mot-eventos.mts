// Verificação das regras puras do aviso "Vencimentos de contrato MOT" com eventos (o projeto não tem runner de
// testes). As libs importam umas às outras sem extensão (como o bundler resolve), então roda com o hook de
// resolução do harness:
//   node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-contrato-mot-eventos.mts
// As rotas/páginas (comparação main x branch, 409, DELETE, cron...) ficam em: node scripts/harness-mot/run.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  avisoMotSilenciado, aplicarSilencioPortal, calcularVencimentoContratoMot, precisaAvisoPopupVencimentoMot, mensagemAvisoPopupVencimentoMot,
  CONTRATO_MOT_ROTULO_NEUTRO_PORTAL, type ContratoMotFaixa, type ResumoContratoMot,
} from "../src/lib/contratoMotStatus.ts";
import {
  afastamentoEmAberto, eventosMotValidos, resumirFuncionarioMot, selosRelatorioMot, ordenarEventosMot, acoesDisponiveisMot, type EventoMotLinha,
} from "../src/lib/contratoMotEventos.ts";
import { dataJaChegou, dataEhFutura, hojeBrasiliaISO, formatarDataBR } from "../src/lib/rescisaoProgramada.ts";
import { congelarData, AGORA_ISO, HOJE, dataMais } from "./harness-mot/ambiente.mjs";

congelarData(AGORA_ISO); // 07/10/2026 12:00 em Brasília

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const FAIXAS: ContratoMotFaixa[] = ["data_futura", "renovacao_automatica", "aprovacao_continuidade", "proximo_limite", "limite_excedido"];
const resumo = (o: Partial<ResumoContratoMot> = {}): ResumoContratoMot => ({
  afastadoEmAberto: false, afastadoDesde: null, diasAfastado: null, prorrogado: false, rescisaoProgramadaEm: null, ...o,
});
const ev = (id: string, tipo: string, data: string, extra: Partial<EventoMotLinha> = {}): EventoMotLinha => ({
  id, funcionario_id: "f", tipo, data_evento: data, corrige_evento_id: null, criado_em: `${data}T10:00:00Z`, ...extra,
});

// ── Regra de silêncio: todas as combinações ──────────────────────────────────
await caso("silêncio: 5 faixas × afastado × rescisão × prorrogado = 40 combinações, contra a regra escrita à parte", () => {
  let n = 0;
  for (const faixa of FAIXAS) for (const afastado of [false, true]) for (const rescisao of [false, true]) for (const prorrogado of [false, true]) {
    const r = resumo({ afastadoEmAberto: afastado, afastadoDesde: afastado ? "2026-01-01" : null, prorrogado, rescisaoProgramadaEm: rescisao ? "2026-12-01" : null });
    const esperado = afastado || rescisao || (prorrogado && faixa === "aprovacao_continuidade");
    assert.equal(avisoMotSilenciado(faixa, r), esperado, `${faixa} afastado=${afastado} rescisao=${rescisao} prorrogado=${prorrogado}`);
    n++;
  }
  assert.equal(n, 40);
  assert.equal(avisoMotSilenciado("limite_excedido", undefined), false);
  assert.equal(avisoMotSilenciado("limite_excedido", null), false);
});

await caso("silêncio por faixa, caso a caso (a) afastamento (b) rescisão (c) prorrogação só nos 180", () => {
  for (const f of FAIXAS) {
    assert.equal(avisoMotSilenciado(f, resumo({ afastadoEmAberto: true })), true, `(a) ${f}`);
    assert.equal(avisoMotSilenciado(f, resumo({ rescisaoProgramadaEm: "2026-11-30" })), true, `(b) ${f}`);
    assert.equal(avisoMotSilenciado(f, resumo({ prorrogado: true })), f === "aprovacao_continuidade", `(c) ${f}`);
  }
});

// ── Sem evento = idêntico à main ─────────────────────────────────────────────
await caso("sem evento: calcularVencimento, precisaAviso e mensagem IDÊNTICOS aos da main, de -5 a 800 dias", async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "mot-main-"));
  const arquivo = path.join(pasta, "contratoMotStatus.main.ts");
  writeFileSync(arquivo, execFileSync("git", ["show", "main:src/lib/contratoMotStatus.ts"], { encoding: "utf8" }));
  const antigo = await import(pathToFileURL(arquivo).href);
  let comAviso = 0;
  for (let dias = -5; dias <= 800; dias++) {
    const admissao = dataMais(HOJE, -dias);
    const novo = calcularVencimentoContratoMot(admissao);
    const velho = antigo.calcularVencimentoContratoMot(admissao);
    assert.deepEqual(novo, velho, `calcularVencimento dias=${dias}`);
    for (const semResumo of [undefined, null]) {
      assert.equal(precisaAvisoPopupVencimentoMot(novo, semResumo), antigo.precisaAvisoPopupVencimentoMot(velho), `precisaAviso dias=${dias}`);
    }
    assert.equal(precisaAvisoPopupVencimentoMot(novo), antigo.precisaAvisoPopupVencimentoMot(velho));
    assert.equal(mensagemAvisoPopupVencimentoMot(novo), antigo.mensagemAvisoPopupVencimentoMot(velho));
    assert.equal(aplicarSilencioPortal(novo), novo, "sem resumo devolve o mesmo objeto, intocado");
    if (antigo.precisaAvisoPopupVencimentoMot(velho)) comAviso++;
  }
  assert.ok(comAviso > 100, "o intervalo cobre as 3 situações com aviso");
});

await caso("janelas do popup inalteradas: dias 169-179 (180), 259-269 (270), 270+ (excedido); nada entre 180 e 258", () => {
  const avisa = (dias: number) => precisaAvisoPopupVencimentoMot(calcularVencimentoContratoMot(dataMais(HOJE, -dias)));
  for (const [dias, esperado] of [[168, false], [169, true], [179, true], [180, false], [200, false], [258, false], [259, true], [269, true], [270, true], [702, true]] as const) {
    assert.equal(avisa(dias), esperado, `dias=${dias}`);
  }
});

await caso("com resumo: aviso respeita a janela E o silêncio (prorrogado no dia 175 cala; no dia 262 não)", () => {
  const v175 = calcularVencimentoContratoMot(dataMais(HOJE, -175));
  const v262 = calcularVencimentoContratoMot(dataMais(HOJE, -262));
  const v702 = calcularVencimentoContratoMot(dataMais(HOJE, -702));
  const pror = resumo({ prorrogado: true });
  assert.equal(precisaAvisoPopupVencimentoMot(v175), true);
  assert.equal(precisaAvisoPopupVencimentoMot(v175, pror), false);
  assert.equal(precisaAvisoPopupVencimentoMot(v262, pror), true);
  assert.equal(precisaAvisoPopupVencimentoMot(v702, pror), true);
  assert.equal(precisaAvisoPopupVencimentoMot(v702, resumo({ afastadoEmAberto: true })), false);
  assert.equal(precisaAvisoPopupVencimentoMot(v262, resumo({ rescisaoProgramadaEm: "2027-01-01" })), false);
  // silêncio nunca CRIA aviso: fora da janela continua sem aviso
  assert.equal(precisaAvisoPopupVencimentoMot(calcularVencimentoContratoMot(dataMais(HOJE, -200)), resumo({ prorrogado: true })), false);
});

// ── Afastamento em aberto e anulação ─────────────────────────────────────────
await caso("afastamento em aberto: início sem fim; fim fecha; vários ciclos; fim solto ignorado; empate de data usa criado_em", () => {
  const aberto = (...e: EventoMotLinha[]) => afastamentoEmAberto(eventosMotValidos(e));
  assert.deepEqual(aberto(), { aberto: false, desde: null });
  assert.deepEqual(aberto(ev("1", "afastamento_inicio", "2026-01-10")), { aberto: true, desde: "2026-01-10" });
  assert.deepEqual(aberto(ev("1", "afastamento_inicio", "2026-01-10"), ev("2", "afastamento_fim", "2026-02-10")), { aberto: false, desde: null });
  assert.deepEqual(
    aberto(ev("1", "afastamento_inicio", "2026-01-10"), ev("2", "afastamento_fim", "2026-02-10"), ev("3", "afastamento_inicio", "2026-03-10")),
    { aberto: true, desde: "2026-03-10" },
  );
  assert.deepEqual(aberto(ev("9", "afastamento_fim", "2026-02-10")), { aberto: false, desde: null }, "fim solto");
  assert.equal(aberto(ev("1", "prorrogacao", "2026-01-10")).aberto, false);
  // mesmo dia: início (10h) depois fim (15h) = fechado; ordem de chegada no array não importa
  const mesmoDia = [ev("2", "afastamento_fim", "2026-02-10", { criado_em: "2026-02-10T15:00:00Z" }), ev("1", "afastamento_inicio", "2026-02-10", { criado_em: "2026-02-10T10:00:00Z" })];
  assert.equal(aberto(...mesmoDia).aberto, false);
  assert.deepEqual(ordenarEventosMot(mesmoDia).map((e) => e.id), ["1", "2"]);
});

await caso("evento anulado por corrige_evento_id é ignorado, e a linha de correção também; nada é apagado", () => {
  const original = ev("1", "afastamento_inicio", "2026-01-10");
  const correcao = ev("c1", "afastamento_inicio", "2026-10-07", { corrige_evento_id: "1" });
  const lista = [original, correcao];
  assert.deepEqual(eventosMotValidos(lista).map((e) => e.id), []);
  assert.equal(lista.length, 2, "entrada intacta");
  assert.equal(afastamentoEmAberto(eventosMotValidos(lista)).aberto, false);
  // prorrogação anulada deixa de contar
  const r = resumirFuncionarioMot([ev("p", "prorrogacao", "2026-05-01"), ev("cp", "prorrogacao", "2026-10-07", { corrige_evento_id: "p" })], [], HOJE);
  assert.equal(r, undefined);
  // anular só o início deixa um fim órfão que NÃO afasta
  const ini = ev("i", "afastamento_inicio", "2026-01-10");
  const fim = ev("f", "afastamento_fim", "2026-02-10");
  assert.equal(resumirFuncionarioMot([ini, fim, ev("ci", "afastamento_inicio", "2026-10-07", { corrige_evento_id: "i" })], [], HOJE), undefined);
  // anular o FIM reabre o afastamento
  const reaberto = resumirFuncionarioMot([ini, fim, ev("cf", "afastamento_fim", "2026-10-07", { corrige_evento_id: "f" })], [], HOJE);
  assert.equal(reaberto?.afastadoEmAberto, true);
  assert.equal(reaberto?.afastadoDesde, "2026-01-10");
  // corrige_evento_id ausente (undefined) também conta como "não é correção"
  assert.equal(eventosMotValidos([{ id: "x", corrige_evento_id: undefined as unknown as null }]).length, 1);
});

await caso("resumo: undefined sem nada; dias corridos reais do afastamento; rescisão mais recente; prorrogação", () => {
  assert.equal(resumirFuncionarioMot([], [], HOJE), undefined);
  assert.equal(resumirFuncionarioMot([ev("1", "afastamento_fim", "2026-01-01")], [], HOJE), undefined);
  const aff = resumirFuncionarioMot([ev("1", "afastamento_inicio", "2025-01-10")], [], HOJE)!;
  assert.equal(aff.afastadoEmAberto, true);
  assert.equal(aff.diasAfastado, Math.round((Date.parse(`${HOJE}T00:00:00Z`) - Date.parse("2025-01-10T00:00:00Z")) / 86400000));
  assert.equal(resumirFuncionarioMot([ev("1", "afastamento_inicio", HOJE)], [], HOJE)!.diasAfastado, 0);
  const resc = resumirFuncionarioMot([], [{ funcionario_id: "f", data_desligamento: "2026-11-30" }, { funcionario_id: "f", data_desligamento: "2026-12-15" }], HOJE)!;
  assert.equal(resc.rescisaoProgramadaEm, "2026-12-15");
  assert.equal(resc.afastadoEmAberto, false);
  assert.equal(resumirFuncionarioMot([ev("p", "prorrogacao", "2026-05-01")], [], HOJE)!.prorrogado, true);
});

// ── dataJaChegou nas bordas ──────────────────────────────────────────────────
await caso("dataJaChegou/dataEhFutura: ontem, hoje, amanhã; virada do dia em Brasília", () => {
  assert.equal(dataJaChegou("2026-10-06", HOJE), true);
  assert.equal(dataJaChegou(HOJE, HOJE), true);
  assert.equal(dataJaChegou("2026-10-08", HOJE), false);
  assert.equal(dataEhFutura("2026-10-08", HOJE), true);
  assert.equal(dataEhFutura(HOJE, HOJE), false);
  assert.equal(dataEhFutura("2026-10-06", HOJE), false);
  assert.equal(dataJaChegou("2025-12-31", "2026-01-01"), true, "virada de ano");
  assert.equal(dataJaChegou("2026-10-09", "2026-10-10"), true);
  const Real = (globalThis as unknown as { __DateReal__: DateConstructor }).__DateReal__;
  const em = (iso: string) => hojeBrasiliaISO(new Real(iso));
  assert.equal(em("2026-10-08T02:59:59Z"), "2026-10-07"); // 23:59:59 BRT
  assert.equal(em("2026-10-08T03:00:00Z"), "2026-10-08"); // 00:00:00 BRT
  assert.equal(em("2026-10-07T03:00:00Z"), "2026-10-07");
  assert.equal(em("2026-10-07T02:59:59Z"), "2026-10-06");
  assert.equal(dataJaChegou("2026-10-08", em("2026-10-08T02:59:59Z")), false, "23:59 BRT do dia 07: rescisão de 08/10 ainda não chegou");
  assert.equal(dataJaChegou("2026-10-08", em("2026-10-08T03:00:00Z")), true, "00:00 BRT do dia 08: chegou");
  assert.equal(formatarDataBR("2026-11-30"), "30/11/2026");
});

// ── Portal e selos ───────────────────────────────────────────────────────────
await caso("portal: silenciado vira rótulo neutro e NÃO ganha campo nenhum; não silenciado fica intocado", () => {
  const v = calcularVencimentoContratoMot(dataMais(HOJE, -702));
  const chavesAntes = Object.keys(v).sort();
  const silenciado = aplicarSilencioPortal(v, resumo({ afastadoEmAberto: true, afastadoDesde: "2025-01-10", diasAfastado: 270 }));
  assert.deepEqual(Object.keys(silenciado).sort(), chavesAntes, "mesmas chaves — nada de afastamento vaza");
  assert.equal(silenciado.label, CONTRATO_MOT_ROTULO_NEUTRO_PORTAL.label);
  assert.equal(silenciado.faixa, v.faixa, "dias e faixa reais preservados");
  assert.equal(silenciado.diasTrabalhados, v.diasTrabalhados);
  assert.ok(!JSON.stringify(silenciado).match(/afast|INSS|benef/i));
  const v262 = calcularVencimentoContratoMot(dataMais(HOJE, -262));
  assert.equal(aplicarSilencioPortal(v262, resumo({ prorrogado: true })), v262, "prorrogado na faixa dos 270 não é silenciado");
});

await caso("selos do relatório do painel", () => {
  assert.deepEqual(selosRelatorioMot(undefined), []);
  const s = selosRelatorioMot(resumo({ afastadoEmAberto: true, afastadoDesde: "2025-01-10", diasAfastado: 270, prorrogado: true, rescisaoProgramadaEm: "2026-11-30" }));
  assert.deepEqual(s.map((x) => x.texto), ["Afastado (270 dias)", "Prorrogado", "Rescisão programada 30/11"]);
  assert.deepEqual(selosRelatorioMot(resumo({ afastadoEmAberto: true, afastadoDesde: HOJE, diasAfastado: 1 })).map((x) => x.texto), ["Afastado (1 dia)"]);
});

// ── Botões do painel (acoesDisponiveisMot) ───────────────────────────────────
await caso("botões do painel: matriz completa (ativo × afastado × prorrogado × rescisão × data × perfil), contra a regra escrita à parte", () => {
  let n = 0;
  for (const ativo of [true, false]) for (const afastado of [false, true]) for (const prorrogado of [false, true]) for (const resc of [null, "futura", "hoje", "passada"] as const) for (const podeCorrigir of [false, true]) {
    const data = resc === "futura" ? "2026-11-30" : resc === "hoje" ? HOJE : resc === "passada" ? "2026-10-01" : null;
    const a = acoesDisponiveisMot({ ativo, resumo: { afastadoEmAberto: afastado, prorrogado }, rescisaoProgramada: data ? { data_desligamento: data } : null, hoje: HOJE, podeCorrigir });
    const ctx = `ativo=${ativo} afastado=${afastado} prorrogado=${prorrogado} rescisao=${resc} podeCorrigir=${podeCorrigir}`;
    assert.equal(a.prorrogar, ativo && !resc && !prorrogado, `prorrogar ${ctx}`);
    assert.equal(a.registrarAfastamento, ativo && !resc && !afastado, `registrarAfastamento ${ctx}`);
    assert.equal(a.encerrarAfastamento, ativo && afastado, `encerrarAfastamento ${ctx}`);
    assert.equal(a.encerrarContrato, ativo && !resc, `encerrarContrato ${ctx}`);
    assert.equal(a.cancelarRescisaoProgramada, ativo && resc === "futura" && podeCorrigir, `cancelar ${ctx}`);
    n++;
  }
  assert.equal(n, 2 * 2 * 2 * 4 * 2);
  // os 2 pedidos desta rodada, em frases
  const base = { ativo: true, hoje: HOJE, podeCorrigir: true };
  assert.equal(acoesDisponiveisMot({ ...base, resumo: { afastadoEmAberto: false, prorrogado: true }, rescisaoProgramada: null }).prorrogar, false, "já prorrogado: sem botão Prorrogar");
  assert.equal(acoesDisponiveisMot({ ...base, resumo: null, rescisaoProgramada: null }).prorrogar, true, "sem resumo: botão aparece");
  assert.equal(acoesDisponiveisMot({ ...base, resumo: undefined, rescisaoProgramada: { data_desligamento: HOJE } }).cancelarRescisaoProgramada, false, "data de hoje: sem cancelar");
  assert.equal(acoesDisponiveisMot({ ...base, resumo: undefined, rescisaoProgramada: { data_desligamento: "2026-10-08" } }).cancelarRescisaoProgramada, true, "amanhã: cancelar aparece");
});

console.log(`\n${total} casos OK${process.exitCode ? " (HÁ FALHAS)" : ""}`);
