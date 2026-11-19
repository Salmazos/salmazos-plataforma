// Verificação da planilha de verbas e do valor por extenso da proposta MOT (o projeto não tem runner de testes). Sem banco: tudo em memória.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-mot.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PARAMETROS_MOT_INICIAIS, calcularPlanilhaMot, formatarCentavosBRL, formatarPercentualBp, valorPorExtensoBRL, parametrosMotValidos,
  CHAVES_PARAMETROS_MOT, SALARIO_MAXIMO_CENTAVOS, type ParametrosMot, type PlanilhaMot,
} from "@/lib/propostaMotCalculo";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const P = PARAMETROS_MOT_INICIAIS;
const valor = (pl: PlanilhaMot, chave: string): number | null => [...pl.linhas, ...pl.retencoes].find((l) => l.chave === chave)?.valorCentavos ?? undefined as never;

// Referência independente (BigInt, meio-para-cima) para comparar com a lib em salários variados.
function referencia(salario: number, p: ParametrosMot) {
  const B = BigInt;
  const meioCima = (n: bigint, d: bigint) => (n * 2n + d) / (d * 2n);
  const pct = (v: bigint, bp: number) => meioCima(v * B(bp), 10000n);
  const s = B(salario);
  const fer = meioCima(s, 12n), terco = meioCima(fer, 3n), d13 = meioCima(s, 12n);
  const fgts = pct(s + fer + d13, p.fgts_bp), inss = pct(s, p.inss_patronal_bp);
  const base = s + fer + terco + d13 + fgts + inss;
  const taxa = pct(base, p.taxa_administrativa_bp), enc = pct(base + taxa, p.encargos_tributarios_bp);
  const sub = base + taxa + enc;
  const rets = [p.ret_iss_bp, p.ret_inss_bp, p.ret_ir_bp, p.ret_cofins_bp, p.ret_csll_bp, p.ret_pis_bp].map((bp) => pct(sub, bp));
  return { base: Number(base), sub: Number(sub), rets: rets.map(Number), total: Number(sub - rets.reduce((a, b) => a + b, 0n)) };
}

function conferirConsistencia(pl: PlanilhaMot) {
  const v = (c: string) => valor(pl, c) as number;
  // O que está impresso soma exatamente o que o total diz.
  assert.equal(v("salario") + v("ferias") + v("terco_ferias") + v("decimo_terceiro") + v("fgts") + v("inss_patronal"), pl.baseCentavos, "linhas da base não somam a base");
  assert.equal(pl.baseCentavos + v("taxa_administrativa") + v("encargos_tributarios"), pl.subtotalCentavos, "base + taxa + encargos != subtotal");
  // As linhas IMPRESSAS (Salário até Encargos tributários, sem o Subtotal) somam exatamente o Subtotal.
  const impressas = pl.linhas.filter((l) => l.chave !== "subtotal");
  assert.equal(impressas.reduce((s, l) => s + (l.valorCentavos ?? 0), 0), pl.subtotalCentavos, "linhas impressas não somam o subtotal");
  assert.ok(!pl.linhas.some((l) => l.chave === "base"), "a base não é linha impressa");
  assert.equal(pl.retencoes.reduce((s, r) => s + (r.valorCentavos as number), 0), pl.totalRetencoesCentavos, "retenções não somam");
  assert.equal(pl.subtotalCentavos - pl.totalRetencoesCentavos, pl.totalNfCentavos, "subtotal - retenções != total");
  for (const l of [...pl.linhas, ...pl.retencoes]) if (l.valorCentavos !== null) assert.ok(Number.isInteger(l.valorCentavos) && l.valorCentavos >= 0, `${l.chave} não é inteiro não negativo`);
}

await caso("exemplo R$ 1.000,00 linha a linha, total R$ 1.889,64", () => {
  const pl = calcularPlanilhaMot({ salarioCentavos: 100000, parametros: P });
  const esperado: Record<string, number> = {
    salario: 100000, ferias: 8333, terco_ferias: 2778, decimo_terceiro: 8333, fgts: 9333, inss_patronal: 31200,
    taxa_administrativa: 15998, encargos_tributarios: 56312, subtotal: 232287,
    ret_iss: 4646, ret_inss: 25552, ret_ir: 2323, ret_cofins: 6969, ret_csll: 2323, ret_pis: 1510,
  };
  for (const [chave, v] of Object.entries(esperado)) assert.equal(valor(pl, chave), v, `${chave}: ${valor(pl, chave)} != ${v}`);
  assert.equal(pl.baseCentavos, 159977);
  assert.equal(pl.totalRetencoesCentavos, 43323);
  assert.equal(pl.totalNfCentavos, 188964);
  assert.equal(formatarCentavosBRL(pl.totalNfCentavos).replace(/\s/g, " "), "R$ 1.889,64");
  conferirConsistencia(pl);
});

await caso("ordem das linhas = planilha do Word; sem 'base' nas linhas; impressas (sem subtotal) somam o subtotal", () => {
  const pl = calcularPlanilhaMot({ salarioCentavos: 100000, parametros: P });
  assert.deepEqual(pl.linhas.map((l) => l.chave), [
    "salario", "fgts", "inss_patronal", "ferias", "terco_ferias", "decimo_terceiro", "taxa_administrativa",
    "exames_admissionais", "vale_transporte", "encargos_tributarios", "subtotal",
  ]);
  assert.equal(pl.baseCentavos, 159977);
  const impressas = pl.linhas.filter((l) => l.chave !== "subtotal");
  assert.equal(impressas.reduce((s, l) => s + (l.valorCentavos ?? 0), 0), 232287);
  assert.equal(pl.linhas[pl.linhas.length - 1].valorCentavos, 232287);
});

await caso("FGTS não inclui o 1/3 de férias (base = salário + férias + 13º)", () => {
  const pl = calcularPlanilhaMot({ salarioCentavos: 100000, parametros: P });
  assert.equal(valor(pl, "fgts"), Math.floor(((100000 + 8333 + 8333) * 8 * 2 + 100) / 200)); // 8% de 116.666 = 9.333,28 -> 9333
  const comTerco = Math.round((100000 + 8333 + 2778 + 8333) * 0.08);
  assert.notEqual(valor(pl, "fgts"), comTerco);
});

await caso("Exames Admissionais e Vale Transporte aparecem só como rótulo, sem valor e fora da conta", () => {
  const pl = calcularPlanilhaMot({ salarioCentavos: 100000, parametros: P });
  for (const chave of ["exames_admissionais", "vale_transporte"]) {
    const l = pl.linhas.find((x) => x.chave === chave);
    assert.ok(l, `${chave} ausente`);
    assert.equal(l!.valorCentavos, null);
  }
  assert.equal(pl.totalNfCentavos, 188964);
});

for (const salario of [200000, 151800, 345678, 1, 99, 100, 123456789, 999999]) {
  await caso(`salário ${formatarCentavosBRL(salario)}: linhas somam o subtotal, subtotal - retenções = total, igual à referência BigInt`, () => {
    const pl = calcularPlanilhaMot({ salarioCentavos: salario, parametros: P });
    conferirConsistencia(pl);
    const ref = referencia(salario, P);
    assert.equal(pl.baseCentavos, ref.base);
    assert.equal(pl.subtotalCentavos, ref.sub);
    assert.deepEqual(pl.retencoes.map((r) => r.valorCentavos), ref.rets);
    assert.equal(pl.totalNfCentavos, ref.total);
  });
}

await caso("salários de 1 centavo a R$ 20.000 (passo variado): invariantes sempre fecham", () => {
  for (let s = 1; s <= 2_000_000; s += s < 5000 ? 1 : 7919) conferirConsistencia(calcularPlanilhaMot({ salarioCentavos: s, parametros: P }));
});

await caso("meio-para-cima explícito: 0,5 centavo sobe (R$ 0,06 de salário: férias 0,5 -> 1)", () => {
  // 6 centavos / 12 = 0,5 -> 1; 5 centavos / 12 = 0,4166 -> 0
  assert.equal(valor(calcularPlanilhaMot({ salarioCentavos: 6, parametros: P }), "ferias"), 1);
  assert.equal(valor(calcularPlanilhaMot({ salarioCentavos: 5, parametros: P }), "ferias"), 0);
});

await caso("percentuais zerados: só salário + férias + 1/3 + 13º, sem taxa, encargos nem retenções", () => {
  const zerados = Object.fromEntries(CHAVES_PARAMETROS_MOT.map((k) => [k, 0])) as unknown as ParametrosMot;
  const pl = calcularPlanilhaMot({ salarioCentavos: 100000, parametros: zerados });
  assert.equal(pl.baseCentavos, 100000 + 8333 + 2778 + 8333);
  assert.equal(pl.subtotalCentavos, pl.baseCentavos);
  assert.equal(pl.totalRetencoesCentavos, 0);
  assert.equal(pl.totalNfCentavos, pl.baseCentavos);
  conferirConsistencia(pl);
});

await caso("100% em tudo (limite): continua inteiro e consistente", () => {
  const cheios = Object.fromEntries(CHAVES_PARAMETROS_MOT.map((k) => [k, 10000])) as unknown as ParametrosMot;
  const pl = calcularPlanilhaMot({ salarioCentavos: 100000, parametros: cheios });
  assert.equal(valor(pl, "inss_patronal"), 100000);
  assert.equal(pl.totalNfCentavos, pl.subtotalCentavos - pl.totalRetencoesCentavos);
});

await caso("salário 0, negativo, fracionário, NaN e acima do teto são rejeitados", () => {
  for (const s of [0, -1, -100000, 1.5, NaN, Infinity, SALARIO_MAXIMO_CENTAVOS + 1]) {
    assert.throws(() => calcularPlanilhaMot({ salarioCentavos: s, parametros: P }), /salário/i, `aceitou ${s}`);
  }
  assert.doesNotThrow(() => calcularPlanilhaMot({ salarioCentavos: SALARIO_MAXIMO_CENTAVOS, parametros: P }));
});

await caso("percentuais inválidos são rejeitados (negativo, > 10000, fracionário, ausente, texto)", () => {
  for (const ruim of [-1, 10001, 31.2, NaN, "3120" as unknown as number]) {
    assert.throws(() => calcularPlanilhaMot({ salarioCentavos: 100000, parametros: { ...P, inss_patronal_bp: ruim } }), /Percentuais inválidos/);
  }
  const { fgts_bp: _ignorado, ...semFgts } = P;
  assert.throws(() => calcularPlanilhaMot({ salarioCentavos: 100000, parametros: semFgts as ParametrosMot }), /Percentuais inválidos/);
  assert.equal(parametrosMotValidos(P), true);
  assert.equal(parametrosMotValidos(null), false);
});

await caso("PARAMETROS_MOT_INICIAIS: 10 / 32 / 31,2 / 8 e retenções 2 / 11 / 1 / 3 / 1 / 0,65, e é imutável", () => {
  assert.deepEqual({ ...P }, {
    taxa_administrativa_bp: 1000, encargos_tributarios_bp: 3200, inss_patronal_bp: 3120, fgts_bp: 800,
    ret_iss_bp: 200, ret_inss_bp: 1100, ret_ir_bp: 100, ret_cofins_bp: 300, ret_csll_bp: 100, ret_pis_bp: 65,
  });
  assert.equal(Object.isFrozen(P), true);
  assert.equal(CHAVES_PARAMETROS_MOT.length, 10);
});

await caso("a lib não altera os parâmetros recebidos e é determinística", () => {
  const copia = { ...P };
  const a = calcularPlanilhaMot({ salarioCentavos: 151800, parametros: copia });
  const b = calcularPlanilhaMot({ salarioCentavos: 151800, parametros: copia });
  assert.deepEqual(a, b);
  assert.deepEqual(copia, { ...P });
});

await caso("formatação: moeda a partir de centavos e percentual em pontos-base", () => {
  const f = (c: number) => formatarCentavosBRL(c).replace(/\s/g, " ");
  assert.equal(f(0), "R$ 0,00");
  assert.equal(f(1), "R$ 0,01");
  assert.equal(f(188964), "R$ 1.889,64");
  assert.equal(f(123456789), "R$ 1.234.567,89");
  assert.equal(f(-150), "-R$ 1,50");
  assert.throws(() => formatarCentavosBRL(1.5));
  assert.equal(formatarPercentualBp(3120), "31,2%");
  assert.equal(formatarPercentualBp(65), "0,65%");
  assert.equal(formatarPercentualBp(1000), "10%");
  assert.equal(formatarPercentualBp(10000), "100%");
  assert.equal(formatarPercentualBp(5), "0,05%");
});

const EXTENSOS: [number, string][] = [
  [1, "Um centavo"],
  [100, "Um real"],
  [150, "Um real e cinquenta centavos"],
  [2100, "Vinte e um reais"],
  [10000, "Cem reais"],
  [10101, "Cento e um reais e um centavo"],
  [100000, "Mil reais"],
  [100101, "Mil e um reais e um centavo"],
  [188964, "Mil, oitocentos e oitenta e nove reais e sessenta e quatro centavos"],
  [1234567, "Doze mil, trezentos e quarenta e cinco reais e sessenta e sete centavos"],
  [100000000, "Um milhão de reais"],
  [200000000, "Dois milhões de reais"],
];
for (const [centavos, texto] of EXTENSOS) {
  await caso(`extenso ${formatarCentavosBRL(centavos).replace(/\s/g, " ")}: ${texto}`, () => assert.equal(valorPorExtensoBRL(centavos), texto));
}

await caso("extenso: 1.001,01 e demais casos de ligação (e / vírgula), zero, singular e 'de reais'", () => {
  const e = valorPorExtensoBRL;
  assert.equal(e(100101), "Mil e um reais e um centavo");
  assert.equal(e(0), "Zero reais");
  assert.equal(e(50), "Cinquenta centavos");
  assert.equal(e(99), "Noventa e nove centavos");
  assert.equal(e(110000), "Mil e cem reais");
  assert.equal(e(120000), "Mil e duzentos reais");
  assert.equal(e(200000), "Dois mil reais");
  assert.equal(e(2100000), "Vinte e um mil reais");
  assert.equal(e(10100000), "Cento e um mil reais");
  assert.equal(e(10000000), "Cem mil reais");
  assert.equal(e(100000100), "Um milhão e um reais");
  assert.equal(e(100050000), "Um milhão e quinhentos reais");
  assert.equal(e(100150000), "Um milhão, mil e quinhentos reais");
  assert.equal(e(150000000), "Um milhão e quinhentos mil reais");
  assert.equal(e(120030000), "Um milhão, duzentos mil e trezentos reais");
  assert.equal(e(100000050), "Um milhão de reais e cinquenta centavos");
  assert.equal(e(100000101), "Um milhão e um reais e um centavo");
  assert.equal(e(30000000000), "Trezentos milhões de reais");
  assert.equal(e(100000000000), "Um bilhão de reais");
  assert.equal(e(200000000000), "Dois bilhões de reais");
});

await caso("extenso: nunca 'um mil'; só milhão/bilhão levam 'um'; sempre começa com maiúscula e rejeita entradas inválidas", () => {
  for (let c = 0; c <= 5_000_000; c += 97) {
    const t = valorPorExtensoBRL(c);
    assert.doesNotMatch(t, /(^|, |ão e |ões e )um mil( |,|$)/i, `"um mil" em ${t}`);
    assert.match(t, /^[A-ZÀ-Ú]/);
  }
  for (const ruim of [-1, 1.5, NaN, Infinity]) assert.throws(() => valorPorExtensoBRL(ruim));
  assert.throws(() => valorPorExtensoBRL(1e14));
});

await caso("a lib é pura: nenhum import de servidor, rede, banco, fs ou variável de ambiente", () => {
  const fonte = fs.readFileSync("src/lib/propostaMotCalculo.ts", "utf8");
  assert.doesNotMatch(fonte, /^import\s/m);
  assert.doesNotMatch(fonte, /process\.env|fetch\(|require\(|supabase|from "fs|from "node:/);
  assert.doesNotMatch(fonte, /Math\.random|Date\.now|new Date/);
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
