// Verificação do cálculo e dos schemas da proposta de Terceirização de Serviços (TS) e das migrations 2A e 2F (o projeto não tem runner de testes). Sem banco.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-ts.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  COLUNAS_SEM_USO_TS, MSG_GANHO_TS_NAO_CONFIGURADO, MSG_VALOR_GRANDE_DEMAIS, PARAMETROS_TS_INICIAIS, VALOR_MAXIMO_CENTAVOS,
  calcularPostoTs, calcularPropostaTs, calcularServicoTs, encargosTs, ganhoAplicadoTs, ganhoRealBp, parametrosTsValidos, precoDoCustoTs,
  type ParametrosTs, type PostoTsEntrada, type PostoTsCalculado,
} from "@/lib/propostaTsCalculo";
import { TEMPLATE_VERSAO_TS, conteudoTsSchema, montarSnapshotTs, parametrosTsCreateSchema, snapshotTsSchema } from "@/lib/propostaTs";
import { formatarCentavosBRL, formatarPercentualBp } from "@/lib/propostaMotCalculo";
import { percentualParaBp } from "@/components/propostas/PercentuaisMotAdmin";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const brl = (c: number) => formatarCentavosBRL(c).replace(/\s/g, " ");
const P: ParametrosTs = { ...PARAMETROS_TS_INICIAIS, ganho_padrao_bp: 3000, ganho_minimo_bp: 2000 };
const DESLIGADO: ParametrosTs = { ...P, encargos_sobre_adicionais: false };
const SEM_GANHO: ParametrosTs = { ...PARAMETROS_TS_INICIAIS };

type Item = [string, number];
const posto = (salario: number, adicionais: Item[], beneficios: Item[], uniforme: number, operacao: number, extra: Partial<PostoTsEntrada> = {}): PostoTsEntrada => ({
  salarioCentavos: salario,
  adicionais: adicionais.map(([tipo, valorCentavos]) => ({ tipo, modo: "valor" as const, valorCentavos })),
  beneficios: beneficios.map(([tipo, valorCentavos]) => ({ tipo, valorCentavos, quemPaga: "salmazos" as const })),
  uniformeEpiCentavos: uniforme, uniformeEpiQuemPaga: "salmazos", insumosCentavos: 0, insumosQuemPaga: "salmazos", operacaoCentavos: operacao, efetivos: 1, ...extra,
});
// Casos da planilha do Ölver (salário R$ 1.000,00) e o caso antigo (Auxiliar de Limpeza 44h).
const LIMPEZA = posto(100000, [], [["vale_transporte", 20000], ["refeicao", 48000], ["cesta_basica", 15191]], 10000, 25000);
const PORTEIRO_2026 = posto(100000, [["hora_extra", 19500], ["hora_extra", 4000]], [["vale_transporte", 10000], ["cesta_basica", 15191]], 10000, 0);
const PORTEIRO_2025 = posto(100000, [["assiduidade", 30000]], [["ajuda_de_custo", 40000], ["vale_transporte", 35000], ["refeicao", 45000], ["cesta_basica", 14468]], 10000, 0);
const MAXSOY = posto(100000, [["insalubridade", 129680]], [["vale_transporte", 72600], ["cesta_basica", 60794]], 30000, 40000);
const AUXILIAR = posto(183740, [["insalubridade", 32420], ["assiduidade", 31500]], [["vale_transporte", 20000], ["refeicao", 48000], ["cesta_basica", 15191]], 10000, 25000);
const v = (c: PostoTsCalculado, chave: string) => c.linhas.find((l) => l.chave === chave)?.valorCentavos as number;
const fecha = (p: PostoTsEntrada, par: ParametrosTs, encargos: number, custo: number, preco30?: number) => {
  const c = calcularPostoTs(p, par);
  assert.equal(c.encargosCentavos, encargos, `encargos ${brl(c.encargosCentavos)}`);
  assert.equal(c.custoUnitCentavos, custo, `custo ${brl(c.custoUnitCentavos)}`);
  if (preco30 !== undefined) assert.equal(precoDoCustoTs(c.custoUnitCentavos, 3000), preco30, "preço com ganho de 30%");
};

// Referência independente: as mesmas fórmulas em fração exata (denominador 360), arredondadas uma vez.
const referenciaPadrao = (base: number) => Number((BigInt(base) * 247n * 2n + 360n) / 720n);

await caso("PLANILHA · LIMPEZA: encargos 686,11, custo 2.868,02 (igual ligado ou desligado) e preço 3.728,43 com 30%", () => {
  fecha(LIMPEZA, P, 68611, 286802, 372843);
  fecha(LIMPEZA, DESLIGADO, 68611, 286802, 372843);
  const c = calcularPostoTs(LIMPEZA, P);
  for (const l of c.linhas) console.log(`      ${(l.subtotal ? "= " : "  ") + l.rotulo.padEnd(28)}${brl(l.valorCentavos).padStart(12)}`);
});

await caso("PLANILHA · LIMPEZA com uniforme e refeição por conta do cliente: custo 2.288,02, preço 2.974,43 e as linhas ficam registradas como 'fornecido pelo cliente'", () => {
  const p: PostoTsEntrada = { ...LIMPEZA, uniformeEpiQuemPaga: "cliente", beneficios: LIMPEZA.beneficios.map((b) => (b.tipo === "refeicao" ? { ...b, quemPaga: "cliente" as const } : b)) };
  fecha(p, P, 68611, 228802, 297443);
  const c = calcularPostoTs(p, P);
  assert.deepEqual(c.linhas.filter((l) => l.fornecidoPeloCliente).map((l) => [l.chave, l.valorCentavos]), [["beneficio_2", 0], ["uniforme_epi", 0]]);
});

await caso("PLANILHA · PORTEIRO 2025: ligado 891,94 / 3.636,62 / 4.727,61; desligado (planilha original) 686,11 / 3.430,79", () => {
  fecha(PORTEIRO_2025, P, 89194, 363662, 472761);
  fecha(PORTEIRO_2025, DESLIGADO, 68611, 343079);
});

await caso("PLANILHA · PORTEIRO 2026: ligado 847,35 / 2.434,26 / 3.164,54; desligado (planilha original) 686,11 / 2.273,02", () => {
  fecha(PORTEIRO_2026, P, 84735, 243426, 316454);
  fecha(PORTEIRO_2026, DESLIGADO, 68611, 227302);
});

await caso("PLANILHA · LIMPEZA Maxsoy: ligado 1.575,86 / 5.906,60 / 7.678,58; desligado (planilha original) 686,11 / 5.016,85", () => {
  fecha(MAXSOY, P, 157586, 590660, 767858);
  fecha(MAXSOY, DESLIGADO, 68611, 501685);
});

await caso("INTERRUPTOR: salário 1.000 + adicional 300 → encargos 891,94 ligado e 686,11 desligado (o adicional segue no custo nos dois)", () => {
  const p = posto(100000, [["periculosidade", 30000]], [], 0, 0);
  fecha(p, P, 89194, 219194);
  fecha(p, DESLIGADO, 68611, 198611);
  assert.equal(calcularPostoTs(p, P).baseEncargosCentavos, 130000);
  assert.equal(calcularPostoTs(p, DESLIGADO).baseEncargosCentavos, 100000);
});

await caso("CASO ANTIGO sob a regra nova: arredondando como a planilha, encargos 1.699,22 e custo 5.357,73 (antes 1.699,20 / 5.357,71); o preço antigo 6.890,06 não sai de nenhum ganho em pontos-base", () => {
  fecha(AUXILIAR, P, 169922, 535773);
  assert.equal(precoDoCustoTs(535773, 2860), 689004); // 6.890,04
  assert.equal(precoDoCustoTs(535773, 2861), 689058); // 6.890,58
  assert.equal(precoDoCustoTs(535773, 3000), 696505);
});

await caso("linhas: cada encargo fica a no máximo 1 centavo do valor exato e o que está impresso soma exatamente o total", () => {
  for (const base of [1, 7, 99, 100000, 123500, 183740, 247660, 333333, 12345678, 100000000]) {
    for (const par of [P, { ...P, fgts_bp: 1234, inss_bp: 2777, multa_fgts_bp: 3999 }, { ...P, fgts_bp: 0, inss_bp: 0, multa_fgts_bp: 0 }]) {
      const e = encargosTs(base, par);
      assert.equal(e.valores.reduce((s, x) => s + x, 0), e.totalCentavos, `soma, base ${base}`);
      const fgts = par.fgts_bp / 10000, inss = par.inss_bp / 10000, multa = par.multa_fgts_bp / 10000;
      const exatos = [base / 12, base / 36, base / 12, base / 12, fgts * base * 1.25, inss * base * (14 / 12), multa * fgts * base * 1.25];
      e.valores.forEach((x, i) => assert.ok(Math.abs(x - exatos[i]) < 1.000001, `linha ${i}, base ${base}: ${x} x ${exatos[i]}`));
    }
    assert.equal(encargosTs(base, P).totalCentavos, referenciaPadrao(base), `total, base ${base}`);
  }
  const c = calcularPostoTs(AUXILIAR, P);
  const itens = c.linhas.filter((l) => !l.subtotal);
  assert.equal(itens.reduce((s, l) => s + l.valorCentavos, 0), c.custoUnitCentavos);
  for (const l of c.linhas) assert.ok(Number.isInteger(l.valorCentavos) && l.valorCentavos >= 0, `${l.chave} não é inteiro não negativo`);
});

await caso("adicional percentual incide sobre o SALÁRIO, entra na remuneração e (ligado) na base dos encargos", () => {
  const p: PostoTsEntrada = { ...AUXILIAR, adicionais: [{ tipo: "insalubridade", modo: "percentual", percentualBp: 2000 }, { tipo: "assiduidade", modo: "valor", valorCentavos: 31500 }] };
  const c = calcularPostoTs(p, P);
  assert.equal(v(c, "adicional_1"), 36748); // 20% de 1.837,40 = 367,48
  assert.equal(c.remuneracaoCentavos, 183740 + 36748 + 31500);
  assert.equal(c.encargosCentavos, referenciaPadrao(c.remuneracaoCentavos));
  assert.equal(calcularPostoTs(p, DESLIGADO).encargosCentavos, referenciaPadrao(183740));
});

await caso("QUEM PAGA em cada linha: benefícios (VT, refeição, cesta, assistência médica, ajuda de custo), uniforme/EPI e insumos saem do custo quando é do cliente; a operação sempre entra", () => {
  const base = posto(100000, [], [["vale_transporte", 1000], ["refeicao", 2000], ["cesta_basica", 3000], ["assistencia_medica", 4000], ["ajuda_de_custo", 5000]], 6000, 7000, { insumosCentavos: 8000 });
  const cheio = calcularPostoTs(base, P).custoUnitCentavos;
  assert.equal(cheio, 100000 + 68611 + 15000 + 6000 + 8000 + 7000);
  base.beneficios.forEach((b, i) => {
    const c = calcularPostoTs({ ...base, beneficios: base.beneficios.map((x, j) => (j === i ? { ...x, quemPaga: "cliente" as const } : x)) }, P);
    assert.equal(c.custoUnitCentavos, cheio - b.valorCentavos, b.tipo);
    assert.equal(c.linhas.find((l) => l.chave === `beneficio_${i + 1}`)?.fornecidoPeloCliente, true);
  });
  assert.equal(calcularPostoTs({ ...base, uniformeEpiQuemPaga: "cliente" }, P).custoUnitCentavos, cheio - 6000);
  assert.equal(calcularPostoTs({ ...base, insumosQuemPaga: "cliente" }, P).custoUnitCentavos, cheio - 8000);
  const tudoDoCliente = calcularPostoTs({ ...base, uniformeEpiQuemPaga: "cliente", insumosQuemPaga: "cliente", beneficios: base.beneficios.map((x) => ({ ...x, quemPaga: "cliente" as const })) }, P);
  assert.equal(tudoDoCliente.operacaoCentavos, 7000);
  assert.equal(tudoDoCliente.custoUnitCentavos, 100000 + 68611 + 7000);
  assert.equal(tudoDoCliente.linhas.find((l) => l.chave === "operacao")?.fornecidoPeloCliente, false);
  assert.equal(calcularPostoTs({ ...base, operacaoCentavos: 0 }, P).custoUnitCentavos, cheio - 7000);
  assert.throws(() => calcularPostoTs({ ...base, operacaoCentavos: -1 }, P), /operação/);
});

await caso("preço = round(custo × (10000 + ganho) ÷ 10000); 4 efetivos multiplicam custo e preço (unitário arredondado primeiro); o total é a soma dos postos", () => {
  const um = calcularServicoTs({ modo: "postos", postos: [LIMPEZA] }, P, 3000);
  const quatro = calcularServicoTs({ modo: "postos", postos: [{ ...LIMPEZA, efetivos: 4 }] }, P, 3000);
  assert.equal(quatro.custoCentavos, 286802 * 4);
  assert.equal(quatro.postos[0].precoPostoCentavos, 372843 * 4);
  assert.equal(quatro.precoCentavos, um.precoCentavos * 4);
  const dois = calcularPropostaTs({ servicos: [{ modo: "postos", postos: [LIMPEZA, MAXSOY] }], parametros: P });
  assert.equal(dois.totalMensalCentavos, 372843 + 767858);
  assert.equal(dois.ganhoBp, 3000);
  assert.equal(precoDoCustoTs(100000, 0), 100000);
  assert.equal(precoDoCustoTs(100000, 2860), 128600);
  assert.equal(precoDoCustoTs(5, 1000), 6); // 5,5 sobe
});

await caso("serviço fechado: o custo digitado entra direto no mesmo cálculo de preço", () => {
  const s = calcularServicoTs({ modo: "fechado", custoCentavos: 500000 }, P, 3000);
  assert.deepEqual(s.postos, []);
  assert.equal(s.custoCentavos, 500000);
  assert.equal(s.precoCalculadoCentavos, 650000);
  assert.equal(s.precoCentavos, 650000);
  for (const ruim of [0, -1, 1.5, VALOR_MAXIMO_CENTAVOS + 1]) assert.throws(() => calcularServicoTs({ modo: "fechado", custoCentavos: ruim }, P, 3000), /custo do serviço fechado/);
});

await caso("GANHO aplicado: o da proposta vale sobre o padrão; sem padrão e sem ganho na proposta recusa com a mensagem exata", () => {
  assert.equal(MSG_GANHO_TS_NAO_CONFIGURADO, "O percentual de ganho da Terceirização ainda não foi configurado pela diretoria.");
  assert.equal(ganhoAplicadoTs(P, null), 3000);
  assert.equal(ganhoAplicadoTs(P, undefined), 3000);
  assert.equal(ganhoAplicadoTs(P, 4500), 4500);
  assert.equal(ganhoAplicadoTs(SEM_GANHO, 2500), 2500);
  assert.throws(() => ganhoAplicadoTs(SEM_GANHO, null), (e: Error) => e.message === MSG_GANHO_TS_NAO_CONFIGURADO);
  assert.throws(() => calcularPropostaTs({ servicos: [{ modo: "fechado", custoCentavos: 1000 }], parametros: SEM_GANHO }), (e: Error) => e.message === MSG_GANHO_TS_NAO_CONFIGURADO);
  // Só o custo continua calculável sem ganho: a recusa é do PREÇO.
  assert.ok(calcularPostoTs(LIMPEZA, SEM_GANHO).custoUnitCentavos > 0);
  for (const ruim of [-1, 1.5, 100001]) assert.throws(() => ganhoAplicadoTs(P, ruim), /ganho/);
});

await caso("GANHO MÍNIMO: ganho abaixo do mínimo marca o serviço; no mínimo não; preço manual é comparado com o preço do ganho mínimo", () => {
  const srv = { modo: "postos" as const, postos: [LIMPEZA] };
  assert.equal(calcularServicoTs(srv, P, 3000).abaixoGanhoMinimo, false);
  assert.equal(calcularServicoTs(srv, P, 2000).abaixoGanhoMinimo, false);
  assert.equal(calcularServicoTs(srv, P, 1999).abaixoGanhoMinimo, true);
  const piso = precoDoCustoTs(286802, 2000);
  const noPiso = calcularServicoTs({ ...srv, precoManualCentavos: piso }, P, 3000);
  assert.equal(noPiso.abaixoGanhoMinimo, false);
  assert.equal(noPiso.precoCentavos, piso);
  assert.equal(noPiso.precoCalculadoCentavos, 372843);
  assert.equal(calcularServicoTs({ ...srv, precoManualCentavos: piso - 1 }, P, 3000).abaixoGanhoMinimo, true);
  assert.equal(ganhoRealBp(100000, 130000), 3000);
  assert.equal(ganhoRealBp(100000, 90000), -1000);
  for (const ruim of [0, -5, 1.5]) assert.throws(() => calcularServicoTs({ ...srv, precoManualCentavos: ruim }, P, 3000), /preço manual/);
  assert.throws(() => ganhoRealBp(1000, 0), /preço/);
});

await caso("PERCENTUAL ↔ pontos-base sem erro de arredondamento (28,6% ↔ 2860)", () => {
  assert.equal(percentualParaBp("28,6"), 2860);
  assert.equal(formatarPercentualBp(2860).replace(/\s/g, ""), "28,6%");
  for (let bp = 0; bp <= 100000; bp += 1) assert.equal(percentualParaBp(String(bp / 100).replace(".", ",")), bp);
  for (const ruim of ["28,605", "-1", "abc", ""]) assert.equal(percentualParaBp(ruim), null, ruim);
});

await caso("salário zero ou negativo, efetivos inválidos, valores quebrados e percentuais inválidos são recusados", () => {
  for (const s of [0, -1, -183740, 1.5, NaN, Infinity]) assert.throws(() => calcularPostoTs({ ...AUXILIAR, salarioCentavos: s }, P), /salário/);
  assert.throws(() => calcularPostoTs({ ...AUXILIAR, salarioCentavos: VALOR_MAXIMO_CENTAVOS + 1 }, P), /salário/);
  for (const e of [0, -1, 1.5, 1001]) assert.throws(() => calcularPostoTs({ ...AUXILIAR, efetivos: e }, P), /efetivos/);
  assert.throws(() => calcularPostoTs({ ...AUXILIAR, uniformeEpiCentavos: -1 }, P), /Uniforme/);
  assert.throws(() => calcularPostoTs({ ...AUXILIAR, beneficios: [{ tipo: "refeicao", valorCentavos: 10.5, quemPaga: "salmazos" }] }, P), /Refeição/);
  assert.throws(() => calcularPostoTs({ ...AUXILIAR, adicionais: [{ tipo: "insalubridade", modo: "percentual", percentualBp: 10001 }] }, P), /Insalubridade/);
  assert.throws(() => calcularPostoTs(AUXILIAR, { ...P, fgts_bp: 10001 }), /Percentuais inválidos/);
  assert.equal(parametrosTsValidos({ ...P, ganho_padrao_bp: -1 }), false);
  assert.equal(parametrosTsValidos({ ...P, ganho_minimo_bp: 100001 }), false);
  assert.equal(parametrosTsValidos({ ...P, encargos_sobre_adicionais: undefined }), false);
  assert.equal(parametrosTsValidos(P), true);
  assert.throws(() => calcularServicoTs({ modo: "postos", postos: [] }, P, 3000), /pelo menos um posto/);
});

await caso("tetos: valores grandes calculam sem perder precisão (conferido em BigInt); o que passaria de 2^53 é recusado, nunca arredondado em silêncio", () => {
  const teto = VALOR_MAXIMO_CENTAVOS;
  const grande = posto(teto, Array.from({ length: 10 }, () => ["outro", teto] as Item), Array.from({ length: 10 }, () => ["outro", teto] as Item), teto, teto, { insumosCentavos: teto, efetivos: 100 });
  const c = calcularPostoTs(grande, P);
  assert.equal(c.encargosCentavos, referenciaPadrao(teto * 11));
  const s = calcularServicoTs({ modo: "postos", postos: [grande] }, P, 100000);
  assert.equal(BigInt(s.postos[0].precoUnitCentavos), (BigInt(c.custoUnitCentavos) * 110000n * 2n + 10000n) / 20000n);
  assert.equal(s.precoCentavos, s.postos[0].precoUnitCentavos * 100);
  // 1.000 efetivos com tudo no teto ainda calcula exato (o ganho efetivo usa BigInt por dentro).
  const mil = calcularServicoTs({ modo: "postos", postos: [{ ...grande, efetivos: 1000 }] }, P, 100000);
  assert.equal(BigInt(mil.precoCentavos), BigInt(s.postos[0].precoUnitCentavos) * 1000n);
  assert.equal(mil.ganhoRealBp, 100000);
  assert.throws(() => precoDoCustoTs(Number.MAX_SAFE_INTEGER, 3000), (e: Error) => e.message === MSG_VALOR_GRANDE_DEMAIS);
  const muitos = calcularPropostaTs({ servicos: Array.from({ length: 10 }, () => ({ modo: "fechado" as const, custoCentavos: teto })), parametros: P });
  assert.equal(muitos.custoTotalCentavos, teto * 10);
});

// ── Schemas e snapshot ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const conteudoAuxiliar = () => ({
  servicos: [{
    nome: "Limpeza e conservação", modo: "postos",
    postos: [{
      funcao: "Auxiliar de Limpeza", escala: "44h", horas_mensais: 220, efetivos: 2, salario_centavos: 183740,
      adicionais: [{ tipo: "insalubridade", modo: "valor", valor_centavos: 32420 }, { tipo: "assiduidade", modo: "valor", valor_centavos: 31500 }],
      beneficios: [{ tipo: "vale_transporte", valor_centavos: 20000 }, { tipo: "refeicao", valor_centavos: 48000 }, { tipo: "cesta_basica", valor_centavos: 15191 }],
      uniforme_epi_centavos: 10000, insumos_centavos: 0, operacao_centavos: 25000,
    }],
  }, {
    nome: "Manutenção predial", modo: "fechado",
    fechado: { descricao: "Contrato fechado de manutenção", custo_centavos: 300000 },
  }],
});
type PostoCru = { salario_centavos: number; efetivos: number; escala: string; escala_texto?: string; adicionais: unknown[]; beneficios: unknown[]; insumos_quem_paga?: string };
const primeiro = (c: ReturnType<typeof conteudoAuxiliar>) => (c.servicos[0] as unknown as { postos: PostoCru[] }).postos[0];

await caso("conteudoTsSchema aceita o conteúdo completo, aplica 'quem paga = Salmazos' por padrão e descarta os campos do modelo antigo", () => {
  const r = conteudoTsSchema.parse({ ...conteudoAuxiliar(), iss_override_bp: 200 });
  assert.equal(r.servicos.length, 2);
  assert.deepEqual(r.condicoes.vencimentos_dias, [15, 30]);
  assert.deepEqual(r.clausulas_adicionais, []);
  assert.ok(!("iss_override_bp" in r));
  const p = (r.servicos[0] as { postos: { adicionais: unknown[]; beneficios: { quem_paga: string }[]; uniforme_epi_quem_paga: string; insumos_quem_paga: string }[] }).postos[0];
  assert.equal(p.adicionais.length, 2);
  assert.deepEqual([...p.beneficios.map((b) => b.quem_paga), p.uniforme_epi_quem_paga, p.insumos_quem_paga], ["salmazos", "salmazos", "salmazos", "salmazos", "salmazos"]);
  assert.ok(!("cobertura_bp_override" in p) && !("fornecimento" in r.servicos[0]));
});

await caso("conteudoTsSchema recusa: serviço sem posto, salário 0, efetivos 0, escala 'outra' sem texto, adicional sem valor, tipo inválido, benefício da Salmazos sem valor, 'quem paga' desconhecido, ganho fora do limite, sem serviço", () => {
  const ruim = (alterar: (c: ReturnType<typeof conteudoAuxiliar>) => void) => { const c = conteudoAuxiliar(); alterar(c); return conteudoTsSchema.safeParse(c).success; };
  assert.equal(ruim(() => {}), true);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: unknown[] }).postos = []; }), false);
  for (const s of [0, -5, VALOR_MAXIMO_CENTAVOS + 1]) assert.equal(ruim((c) => { primeiro(c).salario_centavos = s; }), false);
  assert.equal(ruim((c) => { primeiro(c).efetivos = 0; }), false);
  assert.equal(ruim((c) => { primeiro(c).escala = "outra"; }), false);
  assert.equal(ruim((c) => { primeiro(c).escala = "outra"; primeiro(c).escala_texto = "12x36 noturna"; }), true);
  assert.equal(ruim((c) => { primeiro(c).adicionais = [{ tipo: "insalubridade", modo: "valor" }]; }), false);
  assert.equal(ruim((c) => { primeiro(c).adicionais = [{ tipo: "xyz", modo: "valor", valor_centavos: 100 }]; }), false);
  assert.equal(ruim((c) => { primeiro(c).adicionais = [{ tipo: "insalubridade", modo: "percentual", percentual_bp: 0 }]; }), false);
  assert.equal(ruim((c) => { primeiro(c).adicionais = [{ tipo: "hora_extra", modo: "valor", valor_centavos: 19500 }]; }), true);
  assert.equal(ruim((c) => { primeiro(c).beneficios = [{ tipo: "refeicao" }]; }), false);
  assert.equal(ruim((c) => { primeiro(c).beneficios = [{ tipo: "refeicao", quem_paga: "cliente" }]; }), true);
  assert.equal(ruim((c) => { primeiro(c).insumos_quem_paga = "ninguem"; }), false);
  for (const g of [-1, 1.5, 100001, "30"]) assert.equal(ruim((c) => { (c as unknown as { ganho_bp: unknown }).ganho_bp = g; }), false, String(g));
  assert.equal(ruim((c) => { (c.servicos[1] as { fechado: { custo_centavos: number } }).fechado.custo_centavos = 0; }), false);
  assert.equal(ruim((c) => { c.servicos = []; }), false);
  assert.equal(conteudoTsSchema.safeParse({}).success, false);
});

await caso("snapshot TS: monta, valida no próprio schema, congela os parâmetros e o ganho aplicado, e o total é a soma dos serviços", () => {
  const entrada = {
    numero: "OS-TS-0001/26", revisao: 0, templateVersao: TEMPLATE_VERSAO_TS, dataEmissao: "2026-11-25", validadeDias: 15, validadeAte: "2026-12-10",
    clienteNome: "Cliente Teste", aosCuidados: " Maria ", vendedorNome: "Olver", vendedorTelefone: "19 99999-0000", vendedorEmail: "olver@salmazos.com.br",
    parametros: { vigente_desde: "2026-11-25", id: "x", ...P },
  };
  const snap = montarSnapshotTs({ ...entrada, conteudo: conteudoAuxiliar() });
  assert.equal(snapshotTsSchema.safeParse(JSON.parse(JSON.stringify(snap))).success, true);
  assert.equal(snap.modelo, "TS");
  assert.equal(snap.aos_cuidados, "Maria");
  const p = snap.servicos[0].postos[0];
  assert.equal(p.custo_unit_centavos, 535773);
  assert.equal(p.custo_posto_centavos, 535773 * 2);
  assert.equal(p.preco_posto_centavos, 696505 * 2);
  assert.equal(snap.servicos[1].fechado?.custo_centavos, 300000);
  assert.equal(snap.servicos[1].preco_centavos, 390000);
  assert.equal(snap.total_mensal_centavos, snap.servicos[0].preco_centavos + snap.servicos[1].preco_centavos);
  assert.equal(snap.custo_total_centavos, 535773 * 2 + 300000);
  assert.match(snap.total_mensal_extenso, /reais/);
  assert.equal(snap.ganho_bp, 3000);
  assert.equal(snap.ganho_proposta_bp, null);
  assert.equal(snap.parametros.encargos_sobre_adicionais, true);
  const proprio = montarSnapshotTs({ ...entrada, conteudo: { ...conteudoAuxiliar(), ganho_bp: 1000 } });
  assert.equal(proprio.ganho_bp, 1000);
  assert.equal(proprio.ganho_proposta_bp, 1000);
  assert.ok(proprio.total_mensal_centavos < snap.total_mensal_centavos);
  assert.equal(proprio.servicos[0].abaixo_ganho_minimo, true);
  assert.throws(() => montarSnapshotTs({ ...entrada, conteudo: conteudoAuxiliar(), parametros: { vigente_desde: "2026-11-25", ...SEM_GANHO } }), (e: Error) => e.message === MSG_GANHO_TS_NAO_CONFIGURADO);
  assert.throws(() => montarSnapshotTs({ ...entrada, conteudo: { servicos: [] } }));
});

await caso("vigência nova: INSS, FGTS, multa até 100%; ganho padrão e mínimo até 1000%; o interruptor é obrigatório; percentuais do modelo antigo são ignorados", () => {
  const ok = { vigente_desde: "2026-12-01", fgts_bp: 800, inss_bp: 2300, multa_fgts_bp: 4000, ganho_padrao_bp: 2860, ganho_minimo_bp: 1500, encargos_sobre_adicionais: false };
  const r = parametrosTsCreateSchema.parse({ ...ok, iss_bp: 500, lucro_bp: 291 });
  assert.deepEqual(r, ok);
  assert.equal(parametrosTsCreateSchema.safeParse({ ...ok, ganho_padrao_bp: 100000 }).success, true);
  // Mínimo igual ao padrão passa; maior é recusado com a mensagem exata.
  assert.equal(parametrosTsCreateSchema.safeParse({ ...ok, ganho_minimo_bp: 2860 }).success, true);
  const acima = parametrosTsCreateSchema.safeParse({ ...ok, ganho_minimo_bp: 2861 });
  assert.equal(acima.success, false);
  assert.deepEqual(acima.error?.issues.map((i) => i.message), ["O ganho mínimo não pode ser maior que o ganho padrão."]);
  for (const ruim of [{ fgts_bp: 10001 }, { ganho_padrao_bp: 100001 }, { ganho_minimo_bp: -1 }, { inss_bp: 1.5 }, { encargos_sobre_adicionais: "sim" }, { encargos_sobre_adicionais: undefined }, { vigente_desde: "2026-02-30" }]) {
    assert.equal(parametrosTsCreateSchema.safeParse({ ...ok, ...ruim }).success, false, JSON.stringify(ruim));
  }
});

// ── Pureza e migrations ──────────────────────────────────────────────────────────────────────────────────────────────────────────
await caso("as libs do TS não importam servidor, rede, banco, fs nem ambiente; o cálculo só importa o MOT já exportado; as bases do INSS e do FGTS ficam num ponto só", () => {
  const calculo = fs.readFileSync("src/lib/propostaTsCalculo.ts", "utf8");
  assert.deepEqual([...calculo.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]), ["@/lib/propostaMotCalculo"]);
  const ts = fs.readFileSync("src/lib/propostaTs.ts", "utf8");
  const imports = [...ts.matchAll(/from "([^"]+)";$/gm)].map((m) => m[1]);
  for (const i of imports) assert.ok(["zod", "@/lib/propostaTexto", "@/lib/propostaClausulas", "@/lib/propostas", "@/lib/propostaMot", "@/lib/propostaMotCalculo", "@/lib/propostaTsCalculo"].includes(i), `import inesperado: ${i}`);
  const semComentarios = (f: string) => f.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const f of [semComentarios(calculo), semComentarios(ts)]) {
    assert.doesNotMatch(f, /process\.env|fetch\(|require\(|supabase|from "fs|from "node:/);
    assert.doesNotMatch(f, /Math\.random|Date\.now|new Date\(\)/);
  }
  assert.equal((calculo.match(/export function encargosTs\(/g) ?? []).length, 1);
  // Nada do modelo antigo (tributos, despesas, lucro, cobertura) sobrou no cálculo: só a lista das colunas que ficaram na tabela.
  assert.doesNotMatch(semComentarios(calculo).replace(/export const COLUNAS_SEM_USO_TS.*$/m, ""), /iss_bp|pis_bp|cofins_bp|irpj_bp|csll_bp|despesas_bp|lucro_bp|margem|cobertura/);
});

await caso("migration 2A (histórico): cabeçalho APLICADA em 25/11/2026, tabela com os 12 percentuais 0..10000, único em vigente_desde, só inserção, RLS sem policy, função só para service_role, seed e sem contador", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_ts.sql", "utf8");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /^-- APLICADA em 25\/11\/2026 \(Supabase, conferida por SELECT\)\./m);
  assert.doesNotMatch(sql, /NÃO APLICADA/);
  assert.match(codigo, /^begin;$/m);
  assert.match(codigo, /^commit;$/m);
  assert.doesNotMatch(codigo, /\b(drop\s+(table|function|index|column|schema)|truncate|delete\s+from)\b/i);
  assert.deepEqual([...codigo.matchAll(/alter table ([\w.]+)/gi)].map((m) => m[1]), ["public.proposta_ts_parametros"], "o único alter table é o RLS da tabela nova");
  assert.match(codigo, /drop trigger if exists proposta_ts_parametros_imutavel/);
  for (const col of ["fgts_bp", "inss_bp", "multa_fgts_bp", "cobertura_bp", "iss_bp", "pis_bp", "cofins_bp", "irpj_bp", "csll_bp", "despesas_bp", "lucro_bp", "margem_minima_bp"]) {
    assert.match(codigo, new RegExp(`${col}\\s+int\\s+not null check \\(${col}\\s+between 0 and 10000\\)`), col);
  }
  assert.match(codigo, /create unique index if not exists proposta_ts_parametros_vigente_desde_uq on public\.proposta_ts_parametros \(vigente_desde\)/);
  assert.match(codigo, /before update or delete on public\.proposta_ts_parametros[\s\S]*proposta_registro_imutavel/);
  assert.match(codigo, /revoke all on public\.proposta_ts_parametros from public, anon, authenticated/);
  assert.match(codigo, /alter table public\.proposta_ts_parametros enable row level security/);
  assert.doesNotMatch(codigo, /create policy/i);
  assert.match(codigo, /revoke all on function public\.parametros_ts_vigentes\(date\) from public, anon, authenticated/);
  assert.match(codigo, /grant execute on function public\.parametros_ts_vigentes\(date\) to service_role/);
  assert.match(codigo, /select date '2026-11-25', 800, 2300, 4000, 0, 0, 0, 0, 0, 0, 0, 0, 0\s+where not exists/);
  assert.doesNotMatch(codigo, /proposta_contadores/);
  assert.match(sql, /o TS NÃO tem contador próprio/);
  assert.match(sql, /migration_propostas_contador_unico.sql, tabela proposta_contador_unico/);
  assert.equal(PARAMETROS_TS_INICIAIS.fgts_bp, 800);
  assert.equal(PARAMETROS_TS_INICIAIS.inss_bp, 2300);
  assert.equal(PARAMETROS_TS_INICIAIS.multa_fgts_bp, 4000);
  assert.deepEqual([PARAMETROS_TS_INICIAIS.ganho_padrao_bp, PARAMETROS_TS_INICIAIS.ganho_minimo_bp, PARAMETROS_TS_INICIAIS.encargos_sobre_adicionais], [0, 0, true]);
});

await caso("migration 2F (ganho): cabeçalho APLICADA em 27/11/2026, transação única, idempotente, só acrescenta as três colunas, sem DROP/DELETE/UPDATE; o código grava 0 nas colunas antigas, todas ainda na tabela", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_ts_ganho.sql", "utf8");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /^-- APLICADA em 27\/11\/2026 \(Supabase, conferida por SELECT\)/m);
  assert.doesNotMatch(sql, /NÃO APLICADA/);
  assert.equal((codigo.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((codigo.match(/^commit;$/gm) ?? []).length, 1);
  assert.doesNotMatch(codigo, /\b(drop|truncate|delete|update|insert|create)\b/i);
  assert.equal((codigo.match(/add column if not exists/g) ?? []).length, 3);
  assert.match(codigo, /ganho_padrao_bp int not null default 0 check \(ganho_padrao_bp >= 0 and ganho_padrao_bp <= 100000\)/);
  assert.match(codigo, /ganho_minimo_bp int not null default 0 check \(ganho_minimo_bp >= 0 and ganho_minimo_bp <= 100000\)/);
  assert.match(codigo, /encargos_sobre_adicionais boolean not null default true/);
  const original = fs.readFileSync("supabase/migration_propostas_ts.sql", "utf8");
  for (const col of COLUNAS_SEM_USO_TS) assert.match(original, new RegExp(`\\n\\s+${col}\\s+int`), col);
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
