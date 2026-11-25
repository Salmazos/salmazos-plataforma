// Verificação do cálculo e dos schemas da proposta de Terceirização de Serviços (TS) e da migration 2A (o projeto não tem runner de testes). Sem banco.
// Rodar: HARNESS_COMPONENTES_REAIS=1 node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-propostas-ts.mts
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MSG_DEDUCOES_TS_INVALIDAS, MSG_PRECO_TS_NAO_CONFIGURADO, MSG_VALOR_GRANDE_DEMAIS, PARAMETROS_TS_INICIAIS, VALOR_MAXIMO_CENTAVOS,
  aplicarOverrideIss, calcularPostoTs, calcularPropostaTs, calcularServicoTs, deducoesPrecoTs, margemRealBp, parametrosTsValidos, precoDoCustoTs,
  type ParametrosTs, type PostoTsEntrada, type PostoTsCalculado,
} from "@/lib/propostaTsCalculo";
import { TEMPLATE_VERSAO_TS, conteudoTsSchema, montarSnapshotTs, snapshotTsSchema } from "@/lib/propostaTs";
import { formatarCentavosBRL } from "@/lib/propostaMotCalculo";

let total = 0;
async function caso(nome: string, fn: () => Promise<void> | void) {
  try { await fn(); total++; console.log(`OK    ${nome}`); }
  catch (e) { console.log(`FALHA ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`); process.exitCode = 1; }
}

const brl = (c: number) => formatarCentavosBRL(c).replace(/\s/g, " ");
// D = 2224 bp: tributos 1633 (iss 500 + pis 65 + cofins 300 + irpj 480 + csll 288) + despesas 300 + lucro 291. Margem mínima 200.
const P: ParametrosTs = { ...PARAMETROS_TS_INICIAIS, iss_bp: 500, pis_bp: 65, cofins_bp: 300, irpj_bp: 480, csll_bp: 288, despesas_bp: 300, lucro_bp: 291, margem_minima_bp: 200 };
const SEM_PRECO: ParametrosTs = { ...PARAMETROS_TS_INICIAIS };
const SALMAZOS = { equipamentos: "salmazos", produtos: "salmazos" } as const;
const CLIENTE = { equipamentos: "cliente", produtos: "cliente" } as const;

// Auxiliar de Limpeza 44h (caso de teste do Ölver). Operação R$ 250,00 em operacao_centavos, com fornecimento = cliente (como Bella Vida e Flynow); cobertura 0.
const AUXILIAR: PostoTsEntrada = {
  salarioCentavos: 183740,
  adicionais: [{ tipo: "insalubridade", modo: "valor", valorCentavos: 32420 }, { tipo: "assiduidade", modo: "valor", valorCentavos: 31500 }],
  beneficios: [{ tipo: "vale_transporte", valorCentavos: 20000 }, { tipo: "refeicao", valorCentavos: 48000 }, { tipo: "cesta_basica", valorCentavos: 15191 }],
  uniformeEpiCentavos: 10000,
  insumosCentavos: 0,
  operacaoCentavos: 25000, // operação/supervisão: sempre entra no custo
  efetivos: 1,
};
const calcAuxiliar = (p: PostoTsEntrada = AUXILIAR, par: ParametrosTs = P) => calcularPostoTs(p, par, { insumosContam: false });
const v = (c: PostoTsCalculado, chave: string) => c.linhas.find((l) => l.chave === chave)?.valorCentavos as number;

// Referência independente (BigInt, meio-para-cima) das fórmulas do Ölver.
function referencia(salario: number, p: ParametrosTs) {
  const B = BigInt;
  const mc = (n: bigint, d: bigint) => (n * 2n + d) / (d * 2n);
  const pct = (x: bigint, bp: number) => mc(x * B(bp), 10000n);
  const rem = B(salario);
  const fer = mc(rem, 12n), terco = mc(fer, 3n), d13 = mc(rem, 12n), aviso = mc(rem, 12n);
  const fgts = pct(rem + fer + d13 + aviso, p.fgts_bp), inss = pct(rem + d13 + aviso, p.inss_bp), multa = pct(fgts, p.multa_fgts_bp);
  return { encargos: Number(fer + terco + d13 + aviso + fgts + inss + multa), rem: Number(rem) };
}

await caso("TESTE DE OURO: Auxiliar de Limpeza 44h, linha a linha (encargos sobre a remuneração completa de R$ 2.476,60)", () => {
  const c = calcAuxiliar();
  console.log("      linha                         valor (R$)    %");
  for (const l of c.linhas) console.log(`      ${(l.subtotal ? "= " : "  ") + l.rotulo.padEnd(28)}${brl(l.valorCentavos).padStart(12)}${l.percentualBp !== null ? `   ${l.percentualBp / 100}%` : ""}`);
  assert.equal(c.remuneracaoCentavos, 247660);
  const esperado: Record<string, number> = {
    salario: 183740, adicional_1: 32420, adicional_2: 31500, remuneracao: 247660,
    ferias: 20638, terco_ferias: 6879, decimo_terceiro: 20638, aviso_previo: 20638, fgts: 24766, inss: 66455, multa_fgts: 9906,
    encargos: 169920, beneficios: 83191, uniforme_epi: 10000, insumos: 0, operacao: 25000, cobertura: 0, custo_unitario: 535771,
  };
  for (const [chave, valor] of Object.entries(esperado)) assert.equal(v(c, chave), valor, `${chave}: ${v(c, chave)} != ${valor}`);
  assert.equal(c.custoUnitCentavos, 535771);
  assert.equal(c.custoPostoCentavos, 535771);
});

await caso("DIVERGÊNCIA DE 2 CENTAVOS com o número do Ölver (encargos 169922 / custo 535773): é arredondamento linha a linha, não erro de fórmula", () => {
  const c = calcAuxiliar();
  // Com as MESMAS fórmulas e SEM arredondar nenhuma linha, os encargos dão 169922,28 (arredondado: 169922): é o número da planilha.
  const rem = 247660;
  const exato = (rem / 12) * 3 + rem / 12 / 3 + 0.08 * (rem + (rem / 12) * 3) + 0.23 * (rem + (rem / 12) * 2) + 0.4 * (0.08 * (rem + (rem / 12) * 3));
  assert.equal(Math.round(exato), 169922);
  // Linha a linha (regra do Ölver) cada linha perde a fração: 3 × 1/12 (−1,00), 1/3 (−0,44), multa (−0,40)... e a soma impressa fecha em 169920.
  assert.equal(c.encargosCentavos, 169920);
  assert.equal(169922 - c.encargosCentavos, 2);
  assert.equal(535773 - c.custoUnitCentavos, 2);
});

await caso("o que está impresso soma exatamente o total (subtotais não entram duas vezes)", () => {
  const c = calcAuxiliar();
  const itens = c.linhas.filter((l) => !l.subtotal);
  const soma = (chaves: (l: { chave: string }) => boolean) => itens.filter(chaves).reduce((s, l) => s + l.valorCentavos, 0);
  assert.equal(soma((l) => /^(salario|adicional_)/.test(l.chave)), c.remuneracaoCentavos);
  assert.equal(soma((l) => ["ferias", "terco_ferias", "decimo_terceiro", "aviso_previo", "fgts", "inss", "multa_fgts"].includes(l.chave)), c.encargosCentavos);
  assert.equal(soma((l) => l.chave.startsWith("beneficio_")), c.beneficiosCentavos);
  assert.equal(itens.reduce((s, l) => s + l.valorCentavos, 0), c.custoUnitCentavos);
  for (const l of c.linhas) assert.ok(Number.isInteger(l.valorCentavos) && l.valorCentavos >= 0, `${l.chave} não é inteiro não negativo`);
});

await caso("encargos conferem com uma referência independente (BigInt) em vários salários, com e sem outros parâmetros", () => {
  for (const salario of [1, 2, 99, 100000, 150000, 183740, 333333, 999999, 12345678, 100000000]) {
    for (const par of [P, { ...P, fgts_bp: 0, inss_bp: 0, multa_fgts_bp: 0 }, { ...P, fgts_bp: 1234, inss_bp: 2777, multa_fgts_bp: 3999 }]) {
      const c = calcularPostoTs({ salarioCentavos: salario, adicionais: [], beneficios: [], uniformeEpiCentavos: 0, insumosCentavos: 0, operacaoCentavos: 0, efetivos: 1 }, par, { insumosContam: true });
      assert.equal(c.encargosCentavos, referencia(salario, par).encargos, `salário ${salario}`);
    }
  }
});

await caso("adicional percentual incide sobre o SALÁRIO e entra na remuneração (base completa dos encargos)", () => {
  const c = calcAuxiliar({ ...AUXILIAR, adicionais: [{ tipo: "insalubridade", modo: "percentual", percentualBp: 2000 }, { tipo: "assiduidade", modo: "valor", valorCentavos: 31500 }] });
  assert.equal(v(c, "adicional_1"), 36748); // 20% de 1.837,40 = 367,48
  assert.equal(c.remuneracaoCentavos, 183740 + 36748 + 31500);
  assert.equal(c.encargosCentavos, referencia(c.remuneracaoCentavos, P).encargos);
});

await caso("preço com D = 2224 bp fica perto de R$ 6.890 e usa round(custo × 10000 ÷ (10000 − D))", () => {
  assert.equal(deducoesPrecoTs(P).totalBp, 2224);
  const c = calcAuxiliar();
  const preco = precoDoCustoTs(c.custoUnitCentavos, P);
  assert.equal(preco, Math.round((535771 * 10000) / 7776)); // 689.000
  assert.ok(Math.abs(preco - 689000) <= 100, `preço ${brl(preco)}`);
  console.log(`      custo ${brl(c.custoUnitCentavos)} → preço ${brl(preco)} (D = 22,24%)`);
});

await caso("D >= 10000 é recusado; D = 0 é recusado com a mensagem da diretoria", () => {
  const c = calcAuxiliar();
  assert.throws(() => precoDoCustoTs(c.custoUnitCentavos, SEM_PRECO), (e: Error) => e.message === MSG_PRECO_TS_NAO_CONFIGURADO);
  assert.equal(MSG_PRECO_TS_NAO_CONFIGURADO, "Os percentuais de preço da Terceirização ainda não foram configurados pela diretoria.");
  assert.throws(() => calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [AUXILIAR] }, SEM_PRECO), (e: Error) => e.message === MSG_PRECO_TS_NAO_CONFIGURADO);
  // Só o custo (sem preço) continua calculável com D = 0: a recusa é do PREÇO.
  assert.equal(calcularPostoTs(AUXILIAR, SEM_PRECO, { insumosContam: false }).custoUnitCentavos > 0, true);
  for (const lucro of [10000 - 1633 - 300, 10000]) {
    assert.equal(deducoesPrecoTs({ ...P, lucro_bp: lucro }).totalBp >= 10000, true);
    assert.throws(() => precoDoCustoTs(535771, { ...P, lucro_bp: lucro }), (e: Error) => e.message === MSG_DEDUCOES_TS_INVALIDAS);
  }
  assert.doesNotThrow(() => precoDoCustoTs(535771, { ...P, lucro_bp: 10000 - 1633 - 300 - 1 })); // D = 9999
});

await caso("4 efetivos multiplicam custo e preço (preço unitário arredondado primeiro, depois × efetivos)", () => {
  const s = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [{ ...AUXILIAR, efetivos: 4 }] }, P);
  const um = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [AUXILIAR] }, P);
  assert.equal(s.postos[0].custoPostoCentavos, 535771 * 4);
  assert.equal(s.postos[0].precoUnitCentavos, um.postos[0].precoUnitCentavos);
  assert.equal(s.postos[0].precoPostoCentavos, um.postos[0].precoUnitCentavos * 4);
  assert.equal(s.custoCentavos, 535771 * 4);
  assert.equal(s.precoCentavos, um.precoCentavos * 4);
});

await caso("serviço fechado: o custo digitado entra direto no mesmo cálculo de preço", () => {
  const s = calcularServicoTs({ modo: "fechado", custoCentavos: 500000 }, P);
  assert.deepEqual(s.postos, []);
  assert.equal(s.custoCentavos, 500000);
  assert.equal(s.precoCalculadoCentavos, Math.round((500000 * 10000) / 7776));
  assert.equal(s.precoCentavos, s.precoCalculadoCentavos);
  for (const ruim of [0, -1, 1.5, VALOR_MAXIMO_CENTAVOS + 1]) assert.throws(() => calcularServicoTs({ modo: "fechado", custoCentavos: ruim }, P), /custo do serviço fechado/);
});

await caso("cobertura: padrão global sobre (rem + encargos + benefícios); override por posto vale só para o posto; override 0 zera", () => {
  const par = { ...P, cobertura_bp: 500 };
  const base = calcAuxiliar(AUXILIAR, par);
  const soma = 247660 + 169920 + 83191; // 500771
  assert.equal(base.coberturaCentavos, 25039);
  assert.equal(base.custoUnitCentavos, 535771 + 25039);
  const o10 = calcAuxiliar({ ...AUXILIAR, coberturaBpOverride: 1000 }, par);
  assert.equal(o10.coberturaCentavos, 50077);
  assert.equal(o10.coberturaBp, 1000);
  const o0 = calcAuxiliar({ ...AUXILIAR, coberturaBpOverride: 0 }, par);
  assert.equal(o0.coberturaCentavos, 0);
  assert.equal(o0.custoUnitCentavos, 535771);
  assert.equal(calcAuxiliar(AUXILIAR, P).coberturaCentavos, 0);
  // No mesmo serviço, um posto com override e outro sem: cada um usa a sua cobertura.
  const s = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [AUXILIAR, { ...AUXILIAR, coberturaBpOverride: 1000 }] }, par);
  assert.equal(s.postos[0].coberturaBp, 500);
  assert.equal(s.postos[1].coberturaBp, 1000);
  assert.ok(soma > 0);
  assert.throws(() => calcAuxiliar({ ...AUXILIAR, coberturaBpOverride: 10001 }, par), /cobertura do posto/);
});

await caso("insumos (produtos e equipamentos) só entram quando a Salmazos fornece; a operação entra SEMPRE", () => {
  const base = calcularServicoTs({ modo: "postos", fornecimento: CLIENTE, postos: [AUXILIAR] }, P).postos[0];
  assert.equal(base.custoUnitCentavos, 535771);
  // fornecimento = salmazos e insumos 100,00: o custo sobe exatamente R$ 100,00.
  const comInsumos = { ...AUXILIAR, insumosCentavos: 10000 };
  const salmazos = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [comInsumos] }, P).postos[0];
  assert.equal(salmazos.custoUnitCentavos, 535771 + 10000);
  assert.equal(salmazos.insumosCentavos, 10000);
  assert.equal(salmazos.operacaoCentavos, 25000);
  // só equipamentos OU só produtos da Salmazos já fazem os insumos entrarem.
  for (const f of [{ equipamentos: "salmazos", produtos: "cliente" }, { equipamentos: "cliente", produtos: "salmazos" }] as const) {
    assert.equal(calcularServicoTs({ modo: "postos", fornecimento: f, postos: [comInsumos] }, P).postos[0].custoUnitCentavos, 545771);
  }
  // fornecimento = cliente e insumos 100,00: os insumos NÃO entram, mas a operação continua entrando.
  const cliente = calcularServicoTs({ modo: "postos", fornecimento: CLIENTE, postos: [comInsumos] }, P).postos[0];
  assert.equal(cliente.insumosCentavos, 0);
  assert.equal(cliente.custoUnitCentavos, 535771);
  assert.equal(cliente.operacaoCentavos, 25000);
  assert.equal(cliente.linhas.find((l) => l.chave === "insumos")?.valorCentavos, 0);
  assert.equal(cliente.linhas.find((l) => l.chave === "operacao")?.rotulo, "Operação");
  // sem operação o custo cai exatamente 250,00, com qualquer fornecimento.
  for (const f of [CLIENTE, SALMAZOS]) assert.equal(calcularServicoTs({ modo: "postos", fornecimento: f, postos: [{ ...AUXILIAR, operacaoCentavos: 0 }] }, P).postos[0].custoUnitCentavos, 535771 - 25000);
  // a operação não entra na base da cobertura (rem + encargos + benefícios).
  const par = { ...P, cobertura_bp: 500 };
  assert.equal(calcAuxiliar(AUXILIAR, par).coberturaCentavos, calcAuxiliar({ ...AUXILIAR, operacaoCentavos: 0 }, par).coberturaCentavos);
  assert.throws(() => calcAuxiliar({ ...AUXILIAR, operacaoCentavos: -1 }), /operação/);
});

await caso("margem de preço manual: calculado ≈ lucro_bp; manual menor derruba a margem e aciona abaixo_margem_minima", () => {
  const s = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [AUXILIAR] }, P);
  assert.ok(Math.abs(s.margemRealBp - 291) <= 2, `margem ${s.margemRealBp}`);
  assert.equal(s.abaixoMargemMinima, false);
  // Fórmula: 10000 − tributos − despesas − custo×10000/preço.
  assert.equal(margemRealBp(535771, 689000, P), 10000 - 1633 - 300 - Math.round((535771 * 10000) / 689000));
  // Preço manual igual ao custo: margem = −(tributos + despesas) (negativa).
  assert.equal(margemRealBp(535771, 535771, P), 10000 - 1633 - 300 - 10000);
  // Preço manual que deixa a margem em 150 bp (< 200 de mínimo).
  const manual = Math.round((535771 * 10000) / (10000 - 1633 - 300 - 150));
  const m = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [AUXILIAR], precoManualCentavos: manual }, P);
  assert.equal(m.precoManualCentavos, manual);
  assert.equal(m.precoCentavos, manual);
  assert.equal(m.precoCalculadoCentavos, s.precoCentavos);
  assert.ok(Math.abs(m.margemRealBp - 150) <= 1, `margem ${m.margemRealBp}`);
  assert.equal(m.abaixoMargemMinima, true);
  // Preço manual maior: margem maior e fora da zona de bloqueio.
  const maior = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [AUXILIAR], precoManualCentavos: 750000 }, P);
  assert.ok(maior.margemRealBp > 291 && !maior.abaixoMargemMinima);
  for (const ruim of [0, -5, 1.5]) assert.throws(() => calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [AUXILIAR], precoManualCentavos: ruim }, P), /preço manual/);
  assert.throws(() => margemRealBp(1000, 0, P), /preço/);
});

await caso("override de ISS por proposta: troca só o ISS, vale no cálculo e nos parâmetros efetivos do snapshot", () => {
  assert.equal(aplicarOverrideIss(P, null), P);
  assert.equal(aplicarOverrideIss(P, undefined), P);
  const o = aplicarOverrideIss(P, 300);
  assert.equal(o.iss_bp, 300);
  assert.equal(o.pis_bp, P.pis_bp);
  const a = calcularPropostaTs({ servicos: [{ modo: "fechado", custoCentavos: 500000 }], parametros: P });
  const b = calcularPropostaTs({ servicos: [{ modo: "fechado", custoCentavos: 500000 }], parametros: P, issOverrideBp: 300 });
  assert.equal(b.parametros.iss_bp, 300);
  assert.equal(P.iss_bp, 500, "o parâmetro original não é alterado");
  assert.ok(b.totalMensalCentavos < a.totalMensalCentavos, "ISS menor, preço menor");
  assert.equal(b.totalMensalCentavos, Math.round((500000 * 10000) / (10000 - 2024)));
  assert.throws(() => aplicarOverrideIss(P, 10001), /ISS/);
});

await caso("salário zero ou negativo, efetivos inválidos e valores quebrados são recusados", () => {
  for (const s of [0, -1, -183740, 1.5, NaN, Infinity]) assert.throws(() => calcAuxiliar({ ...AUXILIAR, salarioCentavos: s }), /salário/);
  assert.throws(() => calcAuxiliar({ ...AUXILIAR, salarioCentavos: VALOR_MAXIMO_CENTAVOS + 1 }), /salário/);
  for (const e of [0, -1, 1.5, 1001]) assert.throws(() => calcAuxiliar({ ...AUXILIAR, efetivos: e }), /efetivos/);
  assert.throws(() => calcAuxiliar({ ...AUXILIAR, uniformeEpiCentavos: -1 }), /uniforme/);
  assert.throws(() => calcAuxiliar({ ...AUXILIAR, beneficios: [{ tipo: "refeicao", valorCentavos: 10.5 }] }), /Refeição/);
  assert.throws(() => calcAuxiliar({ ...AUXILIAR, adicionais: [{ tipo: "insalubridade", modo: "percentual", percentualBp: 10001 }] }), /Insalubridade/);
  assert.throws(() => calcAuxiliar(AUXILIAR, { ...P, fgts_bp: 10001 }), /Percentuais inválidos/);
  assert.equal(parametrosTsValidos({ ...P, lucro_bp: -1 }), false);
  assert.equal(parametrosTsValidos(P), true);
  assert.throws(() => calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [] }, P), /pelo menos um posto/);
});

await caso("tetos: valores grandes calculam sem perder precisão (conferido em BigInt); o que passaria de 2^53 é recusado, nunca arredondado em silêncio", () => {
  const teto = VALOR_MAXIMO_CENTAVOS;
  // Grande mas possível: salário no teto, uniforme e insumos no teto, 1.000 efetivos, cobertura de 100%.
  const grande: PostoTsEntrada = { salarioCentavos: teto, adicionais: [], beneficios: [], uniformeEpiCentavos: teto, insumosCentavos: teto, operacaoCentavos: 0, efetivos: 400, coberturaBpOverride: 10000 };
  const c = calcularPostoTs(grande, P, { insumosContam: true }); // o serviço usa SALMAZOS: insumos entram
  assert.equal(c.encargosCentavos, referencia(teto, P).encargos);
  const s = calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [grande] }, P);
  assert.ok(Number.isSafeInteger(s.precoCentavos) && s.precoCentavos > s.custoCentavos);
  assert.equal(BigInt(s.postos[0].precoUnitCentavos), (BigInt(c.custoUnitCentavos) * 10000n * 2n + 7776n) / (7776n * 2n));
  assert.equal(s.precoCentavos, s.postos[0].precoUnitCentavos * 400);
  assert.equal(BigInt(s.margemRealBp), 10000n - 1633n - 300n - (BigInt(s.custoCentavos) * 10000n * 2n + BigInt(s.precoCentavos)) / (BigInt(s.precoCentavos) * 2n));
  // Absurdo (todos os campos no teto, 1.000 efetivos): o posto ainda calcula, mas o serviço passaria de 2^53 e é RECUSADO.
  const absurdo: PostoTsEntrada = {
    ...grande,
    efetivos: 1000,
    adicionais: Array.from({ length: 10 }, () => ({ tipo: "outro", modo: "valor" as const, valorCentavos: teto })),
    beneficios: Array.from({ length: 10 }, () => ({ tipo: "outro", valorCentavos: teto })),
  };
  assert.ok(Number.isSafeInteger(calcularPostoTs(absurdo, P, { insumosContam: true }).custoPostoCentavos));
  assert.throws(() => calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [absurdo] }, P), (e: Error) => e.message === MSG_VALOR_GRANDE_DEMAIS);
  // D = 9999: o preço unitário (custo × 10.000) × 1.000 efetivos passa de 2^53: recusa, não resposta errada.
  assert.throws(() => calcularServicoTs({ modo: "postos", fornecimento: SALMAZOS, postos: [absurdo] },{ ...P, lucro_bp: 10000 - 1633 - 300 - 1 }), (e: Error) => e.message === MSG_VALOR_GRANDE_DEMAIS);
  assert.throws(() => precoDoCustoTs(Number.MAX_SAFE_INTEGER, P), (e: Error) => e.message === MSG_VALOR_GRANDE_DEMAIS);
  // Somar muitos serviços no limite continua exato.
  const muitos = calcularPropostaTs({ servicos: Array.from({ length: 10 }, () => ({ modo: "fechado" as const, custoCentavos: teto })), parametros: P });
  assert.equal(muitos.custoTotalCentavos, teto * 10);
});

// ── Schemas e snapshot ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const conteudoAuxiliar = () => ({
  servicos: [{
    nome: "Limpeza e conservação", modo: "postos", fornecimento: { equipamentos: "salmazos", produtos: "salmazos" },
    postos: [{
      funcao: "Auxiliar de Limpeza", escala: "44h", horas_mensais: 220, efetivos: 2, salario_centavos: 183740,
      adicionais: [{ tipo: "insalubridade", modo: "valor", valor_centavos: 32420 }, { tipo: "assiduidade", modo: "valor", valor_centavos: 31500 }],
      beneficios: [{ tipo: "vale_transporte", valor_centavos: 20000 }, { tipo: "refeicao", valor_centavos: 48000 }, { tipo: "cesta_basica", valor_centavos: 15191 }],
      uniforme_epi_centavos: 10000, insumos_centavos: 0, operacao_centavos: 25000,
    }],
  }, {
    nome: "Manutenção predial", modo: "fechado", fornecimento: { equipamentos: "cliente", produtos: "cliente" },
    fechado: { descricao: "Contrato fechado de manutenção", custo_centavos: 300000 },
  }],
});

await caso("conteudoTsSchema aceita o conteúdo completo (postos + serviço fechado) e aplica os padrões", () => {
  const r = conteudoTsSchema.parse(conteudoAuxiliar());
  assert.equal(r.servicos.length, 2);
  assert.deepEqual(r.condicoes.vencimentos_dias, [15, 30]);
  assert.deepEqual(r.clausulas_adicionais, []);
  const p = (r.servicos[0] as { postos: { adicionais: unknown[]; cobertura_bp_override?: number | null }[] }).postos[0];
  assert.equal(p.adicionais.length, 2);
  assert.equal(p.cobertura_bp_override ?? null, null);
});

await caso("conteudoTsSchema recusa: serviço sem posto, salário 0, efetivos 0, escala 'outra' sem texto, adicional sem valor, tipo inválido, sem serviço", () => {
  const ruim = (alterar: (c: ReturnType<typeof conteudoAuxiliar>) => void) => { const c = conteudoAuxiliar(); alterar(c); return conteudoTsSchema.safeParse(c).success; };
  assert.equal(ruim(() => {}), true);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: unknown[] }).postos = []; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { salario_centavos: number }[] }).postos[0].salario_centavos = 0; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { salario_centavos: number }[] }).postos[0].salario_centavos = -5; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { salario_centavos: number }[] }).postos[0].salario_centavos = VALOR_MAXIMO_CENTAVOS + 1; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { efetivos: number }[] }).postos[0].efetivos = 0; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { escala: string }[] }).postos[0].escala = "outra"; }), false);
  assert.equal(ruim((c) => { const p = (c.servicos[0] as { postos: { escala: string; escala_texto?: string }[] }).postos[0]; p.escala = "outra"; p.escala_texto = "12x36 noturna"; }), true);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { adicionais: unknown[] }[] }).postos[0].adicionais = [{ tipo: "insalubridade", modo: "valor" }]; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { adicionais: unknown[] }[] }).postos[0].adicionais = [{ tipo: "xyz", modo: "valor", valor_centavos: 100 }]; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { postos: { adicionais: unknown[] }[] }).postos[0].adicionais = [{ tipo: "insalubridade", modo: "percentual", percentual_bp: 0 }]; }), false);
  assert.equal(ruim((c) => { (c.servicos[0] as { fornecimento: unknown }).fornecimento = { equipamentos: "salmazos" }; }), false);
  assert.equal(ruim((c) => { (c.servicos[1] as { fechado: { custo_centavos: number } }).fechado.custo_centavos = 0; }), false);
  assert.equal(ruim((c) => { c.servicos = []; }), false);
  assert.equal(conteudoTsSchema.safeParse({}).success, false);
});

await caso("snapshot TS: monta, valida no próprio schema, congela os parâmetros (com o ISS efetivo) e o total é a soma dos serviços", () => {
  const entrada = {
    numero: "OS-TS-0001/26", revisao: 0, templateVersao: TEMPLATE_VERSAO_TS, dataEmissao: "2026-11-25", validadeDias: 15, validadeAte: "2026-12-10",
    clienteNome: "Cliente Teste", aosCuidados: " Maria ", vendedorNome: "Olver", vendedorTelefone: "19 99999-0000", vendedorEmail: "olver@salmazos.com.br",
    parametros: { vigente_desde: "2026-11-25", id: "x", ...P },
  };
  const snap = montarSnapshotTs({ ...entrada, conteudo: conteudoAuxiliar() });
  assert.equal(snapshotTsSchema.safeParse(JSON.parse(JSON.stringify(snap))).success, true);
  assert.equal(snap.modelo, "TS");
  assert.equal(snap.aos_cuidados, "Maria");
  const posto = snap.servicos[0].postos[0];
  assert.equal(posto.custo_unit_centavos, 535771);
  assert.equal(posto.custo_posto_centavos, 535771 * 2);
  assert.equal(posto.preco_posto_centavos, posto.preco_unit_centavos * 2);
  assert.equal(snap.servicos[1].fechado?.custo_centavos, 300000);
  assert.equal(snap.servicos[1].preco_centavos, Math.round((300000 * 10000) / 7776));
  assert.equal(snap.total_mensal_centavos, snap.servicos[0].preco_centavos + snap.servicos[1].preco_centavos);
  assert.equal(snap.custo_total_centavos, 535771 * 2 + 300000);
  assert.match(snap.total_mensal_extenso, /reais/);
  assert.equal(snap.parametros.iss_bp, 500);
  assert.equal(snap.iss_override_bp, null);
  const comIss = montarSnapshotTs({ ...entrada, conteudo: { ...conteudoAuxiliar(), iss_override_bp: 200 } });
  assert.equal(comIss.parametros.iss_bp, 200);
  assert.equal(comIss.iss_override_bp, 200);
  assert.ok(comIss.total_mensal_centavos < snap.total_mensal_centavos);
  // Sem preço configurado a montagem recusa com a mensagem da diretoria.
  assert.throws(() => montarSnapshotTs({ ...entrada, conteudo: conteudoAuxiliar(), parametros: { vigente_desde: "2026-11-25", ...SEM_PRECO } }), (e: Error) => e.message === MSG_PRECO_TS_NAO_CONFIGURADO);
  // Conteúdo inválido não vira snapshot.
  assert.throws(() => montarSnapshotTs({ ...entrada, conteudo: { servicos: [] } }));
});

// ── Pureza e migration ───────────────────────────────────────────────────────────────────────────────────────────────────────────
await caso("as libs do TS não importam servidor, rede, banco, fs nem ambiente; o cálculo só importa o MOT já exportado (e nada do MOT foi alterado)", () => {
  const calculo = fs.readFileSync("src/lib/propostaTsCalculo.ts", "utf8");
  assert.deepEqual([...calculo.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]), ["@/lib/propostaMotCalculo"]);
  const ts = fs.readFileSync("src/lib/propostaTs.ts", "utf8");
  const imports = [...ts.matchAll(/from "([^"]+)";$/gm)].map((m) => m[1]);
  for (const i of imports) assert.ok(["zod", "@/lib/propostaTexto", "@/lib/propostaClausulas", "@/lib/propostas", "@/lib/propostaMot", "@/lib/propostaMotCalculo", "@/lib/propostaTsCalculo"].includes(i), `import inesperado: ${i}`);
  const semComentarios = (f: string) => f.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const f of [semComentarios(calculo), semComentarios(ts)]) {
    assert.doesNotMatch(f, /process\.env|fetch\(|require\(|supabase|from "fs|from "node:/);
    // Sem relógio e sem sorteio: `new Date(texto)` (só para validar uma data digitada) é puro; o que não pode é ler a hora (Date.now, new Date()) nem sortear.
    assert.doesNotMatch(f, /Math\.random|Date\.now|new Date\(\)/);
  }
  assert.match(calculo, /pode mudar — confirmar com contador/);
  assert.equal((calculo.match(/baseFgts: r\./g) ?? []).length, 1, "a base do FGTS é definida num ponto só");
  assert.equal((calculo.match(/baseInss: r\./g) ?? []).length, 1, "a base do INSS é definida num ponto só");
});

await caso("migration 2A: cabeçalho APLICADA em 25/11/2026, tabela com os 12 percentuais 0..10000, único em vigente_desde na criação, só inserção, RLS sem policy, sem privilégio, função só para service_role, seed e sem contador", () => {
  const sql = fs.readFileSync("supabase/migration_propostas_ts.sql", "utf8");
  const codigo = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /^-- APLICADA em 25\/11\/2026 \(Supabase, conferida por SELECT\)\./m);
  assert.doesNotMatch(sql, /NÃO APLICADA/);
  assert.match(codigo, /^begin;$/m);
  assert.match(codigo, /^commit;$/m);
  assert.doesNotMatch(codigo, /\b(drop\s+(table|function|index|column|schema)|truncate|delete\s+from)\b/i);
  assert.deepEqual([...codigo.matchAll(/alter table ([\w.]+)/gi)].map((m) => m[1]), ["public.proposta_ts_parametros"], "o único alter table é o RLS da tabela nova");
  assert.match(codigo, /drop trigger if exists proposta_ts_parametros_imutavel/); // só o gatilho próprio, recriado logo em seguida
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
  assert.equal(Object.values(PARAMETROS_TS_INICIAIS).reduce((s, x) => s + x, 0), 800 + 2300 + 4000);
});

console.log(`\n${total} verificações OK${process.exitCode ? " (com FALHAS acima)" : ""}`);
