// Férias (aviso de vencimento): regras puras de src/lib/feriasRegras.ts — períodos aquisitivos, data-limite, semáforo, saldo inicial e avisos.
// Sem banco nem rotas (as rotas ficam em scripts/verificar-ferias-rotas.mts).
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-ferias-regras.mts
import assert from "node:assert/strict";
import {
  adicionarDiasISO, aniversarioISO, avaliarFerias, ROTULO_ESTADO_FERIAS, ROTULO_SITUACAO_FERIAS, SITUACOES_FERIAS, avisoPendente, avisoVencidoPendente, colunasDeAviso, decidirAvisoFerias, calcularPeriodo, calcularSemaforo, diasEntre, diasRestantes, ehElegivelFerias, MAX_PERIODOS,
  periodoAtual, periodosDivergentes, periodosFaltantes, periodosIniciadosAte, precisaSaldoInicial, programacaoVencida, resolverDataBase, resolverSaldoInicial, saldoResolvido, somarMesesISO,
  type PeriodoFerias,
} from "../src/lib/feriasRegras";

const HOJE = "2026-11-21";
let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log(`OK ${nome}`); };

// Monta um período "do banco" a partir da data-base, com os campos de controle em branco.
const periodo = (dataBase: string, numero: number, extra: Partial<PeriodoFerias> = {}): PeriodoFerias => ({
  id: `p${numero}`, ...calcularPeriodo(dataBase, numero), situacao: "a_programar", gozo_inicio: null, gozo_fim: null, observacao: null, origem: "gerado",
  aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null, ...extra,
});

ok("datas: soma de dias, diferença e soma de meses com fim de mês", () => {
  assert.equal(adicionarDiasISO("2026-02-28", 1), "2026-03-01");
  assert.equal(adicionarDiasISO("2028-02-28", 1), "2028-02-29");
  assert.equal(adicionarDiasISO("2026-01-01", -1), "2025-12-31");
  assert.equal(diasEntre("2026-11-21", "2026-12-21"), 30);
  assert.equal(diasEntre("2026-12-21", "2026-11-21"), -30);
  assert.equal(somarMesesISO("2025-08-31", 6), "2026-02-28");
  assert.equal(somarMesesISO("2024-08-31", 6), "2025-02-28");
  assert.equal(somarMesesISO("2025-02-28", 12), "2026-02-28");
  assert.equal(somarMesesISO("2024-02-29", 12), "2025-02-28");
});

ok("período 1 e data-limite: admissão comum (casos reais de hoje: 16/08/2024 e 04/11/2024)", () => {
  assert.deepEqual(calcularPeriodo("2024-08-16", 1), { numero: 1, aquisitivo_inicio: "2024-08-16", aquisitivo_fim: "2025-08-15", data_limite: "2026-08-15" });
  assert.deepEqual(calcularPeriodo("2024-08-16", 2), { numero: 2, aquisitivo_inicio: "2025-08-16", aquisitivo_fim: "2026-08-15", data_limite: "2027-08-15" });
  assert.deepEqual(calcularPeriodo("2024-11-04", 1), { numero: 1, aquisitivo_inicio: "2024-11-04", aquisitivo_fim: "2025-11-03", data_limite: "2026-11-03" });
});

ok("admissão em 29/02: 28/02 em ano não bissexto, 29/02 em ano bissexto, sem lacuna entre períodos", () => {
  assert.equal(aniversarioISO("2024-02-29", 0), "2024-02-29");
  assert.equal(aniversarioISO("2024-02-29", 1), "2025-02-28");
  assert.equal(aniversarioISO("2024-02-29", 3), "2027-02-28");
  assert.equal(aniversarioISO("2024-02-29", 4), "2028-02-29", "volta a 29/02 no ano bissexto (calculado da data-base, não encadeado)");
  assert.deepEqual(calcularPeriodo("2024-02-29", 1), { numero: 1, aquisitivo_inicio: "2024-02-29", aquisitivo_fim: "2025-02-27", data_limite: "2026-02-27" });
  assert.deepEqual(calcularPeriodo("2024-02-29", 2), { numero: 2, aquisitivo_inicio: "2025-02-28", aquisitivo_fim: "2026-02-27", data_limite: "2027-02-27" });
  const p4 = calcularPeriodo("2024-02-29", 4);
  const p5 = calcularPeriodo("2024-02-29", 5);
  assert.deepEqual(p4, { numero: 4, aquisitivo_inicio: "2027-02-28", aquisitivo_fim: "2028-02-28", data_limite: "2029-02-28" });
  assert.equal(p5.aquisitivo_inicio, "2028-02-29");
  assert.equal(adicionarDiasISO(p4.aquisitivo_fim, 1), p5.aquisitivo_inicio, "p5 começa no dia seguinte ao fim de p4");
  for (let k = 1; k < 10; k++) {
    assert.equal(adicionarDiasISO(calcularPeriodo("2024-02-29", k).aquisitivo_fim, 1), calcularPeriodo("2024-02-29", k + 1).aquisitivo_inicio, `sem lacuna entre ${k} e ${k + 1}`);
  }
});

ok("admissão em 01/03 com fim do aquisitivo em 29/02 (ano bissexto): data-limite em 28/02", () => {
  assert.deepEqual(calcularPeriodo("2023-03-01", 1), { numero: 1, aquisitivo_inicio: "2023-03-01", aquisitivo_fim: "2024-02-29", data_limite: "2025-02-28" });
});

ok("períodos iniciados até hoje: 2 anos e meio → 3 períodos; admissão futura → nenhum; hoje = aniversário abre o próximo", () => {
  assert.deepEqual(periodosIniciadosAte("2024-05-10", HOJE).map((p) => p.numero), [1, 2, 3]);
  assert.deepEqual(periodosIniciadosAte("2026-11-23", HOJE), [], "admissão futura (23/11/2026): sem período");
  assert.deepEqual(periodosIniciadosAte("2026-11-21", HOJE).map((p) => p.numero), [1], "admissão hoje: período 1 já iniciou");
  assert.deepEqual(periodosIniciadosAte("2025-11-21", HOJE).map((p) => p.numero), [1, 2], "no aniversário o período 2 começa");
  assert.deepEqual(periodosIniciadosAte("2025-11-22", HOJE).map((p) => p.numero), [1], "um dia antes do aniversário ainda é o período 1");
  assert.ok(periodosIniciadosAte("1900-01-01", HOJE).length <= MAX_PERIODOS, "data-base absurda não gera dezenas de períodos");
});

ok("garantir períodos é idempotente: só devolve o que falta", () => {
  const todos = periodosIniciadosAte("2024-05-10", HOJE);
  assert.equal(periodosFaltantes("2024-05-10", HOJE, []).length, 3);
  assert.deepEqual(periodosFaltantes("2024-05-10", HOJE, [{ numero: 1 }, { numero: 2 }]).map((p) => p.numero), [3]);
  assert.deepEqual(periodosFaltantes("2024-05-10", HOJE, todos), []);
});

ok("data-base mudou (data_admissao editada depois): os períodos guardados passam a divergir", () => {
  const guardados = periodosIniciadosAte("2024-05-10", HOJE);
  assert.equal(periodosDivergentes("2024-05-10", guardados), false);
  assert.equal(periodosDivergentes("2024-05-11", guardados), true);
  assert.equal(periodosDivergentes("2024-05-10", []), false);
});

ok("data-base = coalesce(ajustada, admissão); a efetivação não entra", () => {
  assert.equal(resolverDataBase("2024-08-16", null), "2024-08-16");
  assert.equal(resolverDataBase("2024-08-16", "2024-09-01"), "2024-09-01");
  assert.equal(resolverDataBase(null, "2024-09-01"), "2024-09-01");
  assert.equal(resolverDataBase(null, null), null);
  assert.equal(resolverDataBase(undefined, undefined), null);
});

ok("rótulos mostrados ao usuário trocados, nomes internos intactos (valores de situacao e do estado)", () => {
  assert.deepEqual([...SITUACOES_FERIAS], ["a_programar", "programada", "em_gozo", "gozada"], "valores gravados no banco não mudam");
  assert.deepEqual(ROTULO_SITUACAO_FERIAS, { a_programar: "A programar", programada: "Programada com a contabilidade", em_gozo: "Em férias", gozada: "Férias tiradas" });
  assert.equal(ROTULO_ESTADO_FERIAS.saldo_pendente, "Quitadas: a informar");
  assert.deepEqual(Object.keys(ROTULO_ESTADO_FERIAS).sort(), ["base_alterada", "ainda_nao_iniciou", "ok", "saldo_pendente", "sem_data_base"].sort());
  // Nenhum texto mostrado ao usuário usa mais "gozo", "gozada" ou "saldo".
  for (const t of [...Object.values(ROTULO_SITUACAO_FERIAS), ...Object.values(ROTULO_ESTADO_FERIAS)]) assert.equal(/gozo|gozad|saldo/i.test(t), false, t);
});

ok("quem entra: ativo E (terceirização OU efetivado); MOT sem efetivação, desligado e R&S ficam fora", () => {
  assert.equal(ehElegivelFerias({ status: "ativo", tipo_servico: "terceirizacao", efetivado_em: null }), true);
  assert.equal(ehElegivelFerias({ status: "ativo", tipo_servico: "terceirizacao", efetivado_em: "2026-10-01" }), true);
  assert.equal(ehElegivelFerias({ status: "ativo", tipo_servico: "mao_obra_temporaria", efetivado_em: "2026-10-01" }), true);
  assert.equal(ehElegivelFerias({ status: "ativo", tipo_servico: "mao_obra_temporaria", efetivado_em: null }), false);
  assert.equal(ehElegivelFerias({ status: "ativo", tipo_servico: "mao_obra_temporaria" }), false);
  assert.equal(ehElegivelFerias({ status: "desligado", tipo_servico: "terceirizacao", efetivado_em: "2026-10-01" }), false);
  assert.equal(ehElegivelFerias({ status: "ativo", tipo_servico: "recrutamento_selecao", efetivado_em: null }), false);
  assert.equal(ehElegivelFerias({ status: "ativo", tipo_servico: null, efetivado_em: null }), false);
});

ok("semáforo: fronteiras 91 / 90 / 31 / 30 / 0 e vencido", () => {
  assert.equal(calcularSemaforo(91), "verde");
  assert.equal(calcularSemaforo(90), "amarelo");
  assert.equal(calcularSemaforo(31), "amarelo");
  assert.equal(calcularSemaforo(30), "vermelho");
  assert.equal(calcularSemaforo(0), "vermelho");
  assert.equal(calcularSemaforo(-1), "vermelho");
  assert.equal(calcularSemaforo(-400), "vermelho");
  const p1 = periodo("2024-12-31", 1);
  const limite = p1.data_limite; // 30/12/2026 (fim do aquisitivo 30/12/2025 + 12 meses)
  assert.equal(limite, "2026-12-30");
  for (const [dias, cor] of [[91, "verde"], [90, "amarelo"], [31, "amarelo"], [30, "vermelho"], [0, "vermelho"], [-1, "vermelho"]] as const) {
    const hoje = adicionarDiasISO(limite, -dias);
    assert.equal(diasRestantes(limite, hoje), dias);
    const a = avaliarFerias({ dataBase: "2024-12-31", saldoConfirmado: true, periodos: [p1], hojeISO: hoje });
    assert.equal(a.semaforo, cor, `${dias} dias`);
    assert.equal(a.diasRestantes, dias);
    assert.equal(a.estado, "ok");
  }
});

ok("funcionário sem data de admissão e sem ajuste: 'informar data-base', cinza, sem período", () => {
  const a = avaliarFerias({ dataBase: null, saldoConfirmado: true, periodos: [], hojeISO: HOJE });
  assert.deepEqual([a.estado, a.semaforo, a.periodo, a.diasRestantes], ["sem_data_base", "cinza", null, null]);
});

ok("admissão futura (23/11/2026): 'ainda não iniciou', cinza, sem período", () => {
  const a = avaliarFerias({ dataBase: "2026-11-23", saldoConfirmado: true, periodos: [], hojeISO: HOJE });
  assert.deepEqual([a.estado, a.semaforo, a.periodo], ["ainda_nao_iniciou", "cinza", null]);
});

ok("sem saldo confirmado: cinza 'Saldo inicial pendente', NUNCA vencido, e nunca avisa (mesmo com prazo estourado)", () => {
  const vencido = periodo("2024-08-16", 1); // limite 15/08/2026: já vencido em 21/11/2026
  assert.ok(diasRestantes(vencido.data_limite, HOJE) < 0);
  const a = avaliarFerias({ dataBase: "2024-08-16", saldoConfirmado: false, periodos: [vencido, periodo("2024-08-16", 2)], hojeISO: HOJE });
  assert.deepEqual([a.estado, a.semaforo, a.diasRestantes], ["saldo_pendente", "cinza", null]);
  assert.equal(a.periodo?.numero, 1, "mostra o período em foco, mas sem prazo");
  assert.equal(avisoPendente(vencido, HOJE, false), null, "nenhum aviso sem saldo confirmado");
});

ok("saldo pendente só com período TERMINADO: 11 meses de casa = 'nenhum' calculado na hora (verde); 13 meses sem saldo = cinza pendente", () => {
  const onze = "2025-12-21"; // 11 meses antes de 21/11/2026: o período 1 só termina em 20/12/2026
  const treze = "2025-10-21"; // 13 meses: o período 1 terminou em 20/10/2026
  assert.equal(precisaSaldoInicial(onze, HOJE), false);
  assert.equal(precisaSaldoInicial(treze, HOJE), true);
  assert.equal(saldoResolvido(onze, false, HOJE), true, "sem período terminado: resolvido sem gravar nada");
  assert.equal(saldoResolvido(treze, false, HOJE), false);
  assert.equal(saldoResolvido(treze, true, HOJE), true);

  const a11 = avaliarFerias({ dataBase: onze, saldoConfirmado: false, periodos: [periodo(onze, 1)], hojeISO: HOJE });
  assert.deepEqual([a11.estado, a11.semaforo, a11.saldoCalculado, a11.periodo?.numero, a11.diasRestantes], ["ok", "verde", true, 1, diasEntre(HOJE, "2027-12-20")]);
  assert.equal(a11.diasRestantes! > 0, true, "nada vencido");

  const a13 = avaliarFerias({ dataBase: treze, saldoConfirmado: false, periodos: [periodo(treze, 1), periodo(treze, 2)], hojeISO: HOJE });
  assert.deepEqual([a13.estado, a13.semaforo, a13.saldoCalculado, a13.diasRestantes], ["saldo_pendente", "cinza", false, null]);

  const confirmado = avaliarFerias({ dataBase: treze, saldoConfirmado: true, periodos: [periodo(treze, 1)], hojeISO: HOJE });
  assert.deepEqual([confirmado.estado, confirmado.saldoCalculado], ["ok", false], "confirmado de verdade não é 'calculado'");

  // Fronteira: o período que termina HOJE ainda não terminou; o que terminou ontem, sim.
  assert.equal(precisaSaldoInicial("2025-11-22", HOJE), false, "fim do período 1 = 21/11/2026 = hoje");
  assert.equal(precisaSaldoInicial("2025-11-21", HOJE), true, "fim do período 1 = 20/11/2026 < hoje");
  const virou = avaliarFerias({ dataBase: "2025-11-21", saldoConfirmado: false, periodos: [periodo("2025-11-21", 1), periodo("2025-11-21", 2)], hojeISO: HOJE });
  assert.equal(virou.estado, "saldo_pendente", "no dia em que o 1º período termina, passa a exigir o saldo");
});

ok("com saldo confirmado e período 1 quitado, o período 2 vira o atual", () => {
  const p1 = periodo("2024-08-16", 1, { situacao: "gozada", origem: "saldo_inicial" });
  const p2 = periodo("2024-08-16", 2);
  const p3 = periodo("2024-08-16", 3);
  assert.equal(periodoAtual([p3, p1, p2])?.numero, 2);
  const a = avaliarFerias({ dataBase: "2024-08-16", saldoConfirmado: true, periodos: [p1, p2, p3], hojeISO: HOJE });
  assert.deepEqual([a.estado, a.periodo?.numero, a.diasRestantes, a.semaforo], ["ok", 2, diasEntre(HOJE, "2027-08-15"), "verde"]);
});

ok("data-base alterada com períodos antigos guardados: 'base_alterada', cinza", () => {
  const a = avaliarFerias({ dataBase: "2024-08-17", saldoConfirmado: true, periodos: [periodo("2024-08-16", 1)], hojeISO: HOJE });
  assert.deepEqual([a.estado, a.semaforo], ["base_alterada", "cinza"]);
});

ok("programada: semáforo continua pela data-limite; 'programação vencida' só quando o início já passou", () => {
  const p = periodo("2024-12-31", 2, { situacao: "programada", gozo_inicio: "2026-12-10", gozo_fim: "2026-12-30" });
  assert.equal(programacaoVencida(p, "2026-12-10"), false, "no dia do início ainda não venceu");
  assert.equal(programacaoVencida(p, "2026-12-11"), true);
  assert.equal(programacaoVencida({ situacao: "em_gozo", gozo_inicio: "2026-12-10" }, "2026-12-20"), false);
  assert.equal(programacaoVencida({ situacao: "a_programar", gozo_inicio: null }, "2026-12-20"), false);
});

ok("avisos: a programar avisa; programada para; programada com início vencido volta; em gozo e gozada nunca", () => {
  const base = { aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null, data_limite: "2026-12-31" };
  const hoje = "2026-12-01"; // 30 dias para o limite
  assert.deepEqual(avisoPendente({ ...base, situacao: "a_programar", gozo_inicio: null }, hoje, true)?.marco, 30);
  assert.equal(avisoPendente({ ...base, situacao: "programada", gozo_inicio: "2026-12-20" }, hoje, true), null, "programada com data futura: sem aviso");
  assert.equal(avisoPendente({ ...base, situacao: "programada", gozo_inicio: "2026-11-25" }, hoje, true)?.marco, 30, "início passou sem virar em gozo: volta");
  assert.equal(avisoPendente({ ...base, situacao: "em_gozo", gozo_inicio: "2026-11-25" }, hoje, true), null);
  assert.equal(avisoPendente({ ...base, situacao: "gozada", gozo_inicio: "2026-11-25" }, hoje, true), null);
});

ok("avisos 90/60/30: um por marco, sem repetir; primeira execução atrasada manda só o mais urgente e marca os outros", () => {
  const p = (extra: Partial<PeriodoFerias>) => ({ situacao: "a_programar" as const, gozo_inicio: null, data_limite: "2026-12-31", aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null, ...extra });
  assert.equal(avisoPendente(p({}), adicionarDiasISO("2026-12-31", -91), true), null, "91 dias: ainda não");
  assert.deepEqual(avisoPendente(p({}), adicionarDiasISO("2026-12-31", -90), true), { marco: 90, marcarComoVistos: [] });
  assert.equal(avisoPendente(p({ aviso_90_em: "2026-10-02T12:00:00Z" }), adicionarDiasISO("2026-12-31", -89), true), null, "90 já enviado: não repete");
  assert.deepEqual(avisoPendente(p({ aviso_90_em: "x" }), adicionarDiasISO("2026-12-31", -60), true), { marco: 60, marcarComoVistos: [] });
  assert.deepEqual(avisoPendente(p({ aviso_90_em: "x", aviso_60_em: "y" }), adicionarDiasISO("2026-12-31", -30), true), { marco: 30, marcarComoVistos: [] });
  assert.equal(avisoPendente(p({ aviso_90_em: "x", aviso_60_em: "y", aviso_30_em: "z" }), "2026-12-30", true), null);
  assert.deepEqual(avisoPendente(p({}), adicionarDiasISO("2026-12-31", -20), true), { marco: 30, marcarComoVistos: [90, 60] }, "cron atrasado: um aviso só");
  assert.deepEqual(avisoPendente(p({ aviso_60_em: "y" }), adicionarDiasISO("2026-12-31", -20), true), { marco: 30, marcarComoVistos: [90] });
  assert.equal(avisoPendente(p({}), "2027-01-10", true), null, "vencido NÃO é marco: o aviso de vencido é outro (avisoVencidoPendente)");
});

ok("vencido: aviso único (registrado em aviso_vencido_em), 'já vistos' para 90 e 60, lembrete só depois de 7 dias, lembretes desligáveis", () => {
  const base = { situacao: "a_programar" as const, gozo_inicio: null, data_limite: "2026-12-31", aviso_90_em: null, aviso_60_em: null, aviso_30_em: null, aviso_vencido_em: null };
  assert.equal(avisoVencidoPendente(base, "2026-12-31", true), null, "no dia da data-limite ainda não venceu");
  assert.deepEqual(avisoVencidoPendente(base, "2027-01-01", true), { lembrete: false, marcarComoVistos: [90, 60] });
  assert.deepEqual(avisoVencidoPendente({ ...base, aviso_90_em: "2026-10-02T12:00:00Z" }, "2027-01-01", true), { lembrete: false, marcarComoVistos: [60] });
  // O aviso do marco de 30 dias (aviso_30_em) NÃO conta como aviso de vencido: o vencido só se registra em aviso_vencido_em.
  assert.deepEqual(avisoVencidoPendente({ ...base, aviso_90_em: "x", aviso_60_em: "x", aviso_30_em: "2026-12-01T12:00:00Z" }, "2027-01-01", true), { lembrete: false, marcarComoVistos: [] });
  // Com aviso_vencido_em preenchido o aviso de vencido já foi enviado: sem repetição diária; lembrete a cada 7 dias contados do último aviso ou lembrete.
  const carimbado = { ...base, aviso_90_em: "x", aviso_60_em: "x", aviso_30_em: "2026-12-01T12:00:00Z", aviso_vencido_em: "2027-01-01T15:00:00Z" };
  for (const dia of ["2027-01-01", "2027-01-02", "2027-01-07"]) assert.equal(avisoVencidoPendente(carimbado, dia, true), null, dia);
  assert.deepEqual(avisoVencidoPendente(carimbado, "2027-01-08", true), { lembrete: true, marcarComoVistos: [] });
  assert.equal(avisoVencidoPendente(carimbado, "2027-02-20", true, 0), null, "lembretes desligados: só o aviso único");
  assert.equal(avisoVencidoPendente(base, "2027-01-01", false), null, "saldo pendente nunca avisa");
  assert.equal(avisoVencidoPendente({ ...base, situacao: "programada", gozo_inicio: "2027-02-01" }, "2027-01-01", true), null, "programada com início futuro: calada");
  assert.deepEqual(avisoVencidoPendente({ ...base, situacao: "programada", gozo_inicio: "2026-12-20" }, "2027-01-01", true), { lembrete: false, marcarComoVistos: [90, 60] }, "início vencido: volta");
  assert.equal(avisoVencidoPendente({ ...base, situacao: "em_gozo", gozo_inicio: "2026-12-20" }, "2027-01-01", true), null);
  // A decisão única e o que gravar.
  assert.deepEqual(decidirAvisoFerias(base, "2026-12-01", true), { tipo: "marco", marco: 30, marcarComoVistos: [90, 60] });
  assert.deepEqual(decidirAvisoFerias(base, "2027-01-01", true), { tipo: "vencido", lembrete: false, marcarComoVistos: [90, 60] });
  assert.equal(decidirAvisoFerias(base, "2026-06-01", true), null);
  assert.deepEqual(colunasDeAviso({ tipo: "marco", marco: 60, marcarComoVistos: [90] }, "T"), { aviso_60_em: "T", aviso_90_em: "T" });
  assert.deepEqual(colunasDeAviso({ tipo: "vencido", lembrete: true, marcarComoVistos: [] }, "T"), { aviso_vencido_em: "T" }, "o vencido NÃO mexe em aviso_30_em");
  assert.deepEqual(colunasDeAviso({ tipo: "vencido", lembrete: false, marcarComoVistos: [90, 60] }, "T"), { aviso_vencido_em: "T", aviso_90_em: "T", aviso_60_em: "T" });
  assert.deepEqual(colunasDeAviso({ tipo: "marco", marco: 30, marcarComoVistos: [] }, "T"), { aviso_30_em: "T" }, "aviso_30_em é só o marco de 30 dias");
});

ok("saldo inicial: 'nenhum', data exata, data aproximada (RH confirma), empate, futura, antes da base, sem período concluído", () => {
  const base = "2024-08-16"; // períodos concluídos hoje: 1 (fim 15/08/2025) e 2 (fim 15/08/2026)
  assert.deepEqual(resolverSaldoInicial(base, null, HOJE), { tipo: "nenhum" });
  assert.deepEqual(resolverSaldoInicial(base, "2025-08-15", HOJE), { tipo: "exato", numero: 1, aquisitivo_fim: "2025-08-15" });
  assert.deepEqual(resolverSaldoInicial(base, "2026-08-15", HOJE), { tipo: "exato", numero: 2, aquisitivo_fim: "2026-08-15" });
  assert.deepEqual(resolverSaldoInicial(base, "2025-09-10", HOJE), { tipo: "aproximado", sugestao: { numero: 1, aquisitivo_fim: "2025-08-15" }, informado: "2025-09-10" });
  assert.deepEqual(resolverSaldoInicial(base, "2026-07-20", HOJE), { tipo: "aproximado", sugestao: { numero: 2, aquisitivo_fim: "2026-08-15" }, informado: "2026-07-20" });
  // Empate (mesma distância dos dois fins): fica o mais antigo, que marca menos períodos como quitados.
  // Base 28/02/2023: fins em 27/02/2024 e 27/02/2025, 366 dias de distância (ano bissexto no meio) → o ponto médio está a 183 dias de cada um.
  const fim1 = calcularPeriodo("2023-02-28", 1).aquisitivo_fim;
  const fim2 = calcularPeriodo("2023-02-28", 2).aquisitivo_fim;
  assert.equal(diasEntre(fim1, fim2), 366);
  const meio = adicionarDiasISO(fim1, 183);
  const empate = resolverSaldoInicial("2023-02-28", meio, HOJE);
  assert.deepEqual(empate.tipo === "aproximado" ? empate.sugestao.numero : null, 1, "empate: o período mais antigo");
  assert.equal(resolverSaldoInicial(base, "2026-11-22", HOJE).tipo, "invalido", "futura");
  assert.equal(resolverSaldoInicial(base, "2024-01-01", HOJE).tipo, "invalido", "antes da data-base");
  assert.equal(resolverSaldoInicial("2026-06-01", "2026-09-01", HOJE).tipo, "invalido", "nenhum período concluído ainda");
  // Período que termina hoje ainda não está concluído.
  assert.equal(resolverSaldoInicial("2025-11-22", "2026-11-21", HOJE).tipo, "invalido");
  assert.deepEqual(resolverSaldoInicial("2025-11-21", "2026-11-20", HOJE), { tipo: "exato", numero: 1, aquisitivo_fim: "2026-11-20" });
});

console.log(`\n${n} verificações de regras de férias passaram.`);
