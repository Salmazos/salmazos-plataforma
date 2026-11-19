// Planilha de verbas da proposta de Mão de Obra Temporária (MOT): lib pura, sem import de servidor (roda no client, no server e no harness).
// DECISÃO DO NEGÓCIO (Ölver): tudo em CENTAVOS INTEIROS, arredondamento meio-para-cima LINHA A LINHA. Cada linha parte dos valores JÁ
// ARREDONDADOS das linhas de que depende, para o que está impresso somar exatamente o total. Nada de ponto flutuante nas contas.

// Percentuais em pontos-base inteiros: 31,2% = 3120, 0,65% = 65, 100% = 10000.
export interface ParametrosMot {
  taxa_administrativa_bp: number;
  encargos_tributarios_bp: number;
  inss_patronal_bp: number;
  fgts_bp: number;
  ret_iss_bp: number;
  ret_inss_bp: number;
  ret_ir_bp: number;
  ret_cofins_bp: number;
  ret_csll_bp: number;
  ret_pis_bp: number;
}

export const PARAMETROS_MOT_INICIAIS: Readonly<ParametrosMot> = Object.freeze({
  taxa_administrativa_bp: 1000,
  encargos_tributarios_bp: 3200,
  inss_patronal_bp: 3120,
  fgts_bp: 800,
  ret_iss_bp: 200,
  ret_inss_bp: 1100,
  ret_ir_bp: 100,
  ret_cofins_bp: 300,
  ret_csll_bp: 100,
  ret_pis_bp: 65,
});

export const CHAVES_PARAMETROS_MOT = Object.keys(PARAMETROS_MOT_INICIAIS) as (keyof ParametrosMot)[];
export const BP_MAXIMO = 10000;
// Teto do salário (R$ 10 milhões): mantém salário x pontos-base abaixo de 2^53, então a conta inteira nunca perde precisão.
export const SALARIO_MAXIMO_CENTAVOS = 1_000_000_000;

export interface LinhaPlanilhaMot {
  chave: string;
  rotulo: string;
  // null = linha só com rótulo, sem valor e fora da conta (Exames Admissionais, Vale Transporte).
  valorCentavos: number | null;
  // Percentual aplicado (pontos-base), quando a linha é um percentual de outra; null nas demais.
  percentualBp: number | null;
}

export interface PlanilhaMot {
  salarioCentavos: number;
  linhas: LinhaPlanilhaMot[];
  baseCentavos: number;
  subtotalCentavos: number;
  retencoes: LinhaPlanilhaMot[];
  totalRetencoesCentavos: number;
  totalNfCentavos: number;
}

export function parametrosMotValidos(p: unknown): p is ParametrosMot {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return CHAVES_PARAMETROS_MOT.every((k) => typeof o[k] === "number" && Number.isInteger(o[k]) && (o[k] as number) >= 0 && (o[k] as number) <= BP_MAXIMO);
}

// Divisão inteira com arredondamento meio-para-cima (só para não negativos): 0,5 centavo sobe.
function dividirArredondando(numerador: number, denominador: number): number {
  return Math.floor((numerador * 2 + denominador) / (denominador * 2));
}
const percentualDe = (valorCentavos: number, bp: number): number => dividirArredondando(valorCentavos * bp, BP_MAXIMO);

export function calcularPlanilhaMot(entrada: { salarioCentavos: number; parametros: ParametrosMot }): PlanilhaMot {
  const { salarioCentavos: salario, parametros: p } = entrada;
  if (!Number.isInteger(salario) || salario <= 0) throw new Error("O salário precisa ser um valor em centavos inteiro e maior que zero.");
  if (salario > SALARIO_MAXIMO_CENTAVOS) throw new Error("O salário passa do limite aceito pela planilha.");
  if (!parametrosMotValidos(p)) throw new Error("Percentuais inválidos: use pontos-base inteiros de 0 a 10000.");

  const ferias = dividirArredondando(salario, 12);
  const tercoFerias = dividirArredondando(ferias, 3);
  const decimoTerceiro = dividirArredondando(salario, 12);
  // BASE DO FGTS (único ponto do código; pode mudar): salário + férias + 13º, SEM o 1/3 de férias (confirmado com o Ölver em 19/11/2026).
  const baseFgts = salario + ferias + decimoTerceiro;
  const fgts = percentualDe(baseFgts, p.fgts_bp);
  const inssPatronal = percentualDe(salario, p.inss_patronal_bp);
  const base = salario + ferias + tercoFerias + decimoTerceiro + fgts + inssPatronal;
  const taxaAdministrativa = percentualDe(base, p.taxa_administrativa_bp);
  const encargosTributarios = percentualDe(base + taxaAdministrativa, p.encargos_tributarios_bp);
  const subtotal = base + taxaAdministrativa + encargosTributarios;

  const linhas: LinhaPlanilhaMot[] = [
    // Ordem da planilha do Word do Ölver. A "base" não é linha impressa: segue no resultado como baseCentavos.
    // As linhas com valor, de Salário até Encargos tributários, somam exatamente o Subtotal.
    { chave: "salario", rotulo: "Salário", valorCentavos: salario, percentualBp: null },
    { chave: "fgts", rotulo: "FGTS", valorCentavos: fgts, percentualBp: p.fgts_bp },
    { chave: "inss_patronal", rotulo: "INSS patronal", valorCentavos: inssPatronal, percentualBp: p.inss_patronal_bp },
    { chave: "ferias", rotulo: "Férias", valorCentavos: ferias, percentualBp: null },
    { chave: "terco_ferias", rotulo: "1/3 sobre férias", valorCentavos: tercoFerias, percentualBp: null },
    { chave: "decimo_terceiro", rotulo: "13º salário", valorCentavos: decimoTerceiro, percentualBp: null },
    { chave: "taxa_administrativa", rotulo: "Taxa administrativa", valorCentavos: taxaAdministrativa, percentualBp: p.taxa_administrativa_bp },
    // Aparecem no modelo, sem valor e fora da conta.
    { chave: "exames_admissionais", rotulo: "Exames Admissionais", valorCentavos: null, percentualBp: null },
    { chave: "vale_transporte", rotulo: "Vale Transporte", valorCentavos: null, percentualBp: null },
    { chave: "encargos_tributarios", rotulo: "Encargos tributários", valorCentavos: encargosTributarios, percentualBp: p.encargos_tributarios_bp },
    { chave: "subtotal", rotulo: "Subtotal", valorCentavos: subtotal, percentualBp: null },
  ];

  const retencao = (chave: string, rotulo: string, bp: number): LinhaPlanilhaMot => ({ chave, rotulo, valorCentavos: percentualDe(subtotal, bp), percentualBp: bp });
  const retencoes = [
    retencao("ret_iss", "ISS", p.ret_iss_bp),
    retencao("ret_inss", "INSS", p.ret_inss_bp),
    retencao("ret_ir", "IR", p.ret_ir_bp),
    retencao("ret_cofins", "COFINS", p.ret_cofins_bp),
    retencao("ret_csll", "CSLL", p.ret_csll_bp),
    retencao("ret_pis", "PIS", p.ret_pis_bp),
  ];
  const totalRetencoes = retencoes.reduce((soma, r) => soma + (r.valorCentavos as number), 0);

  return {
    salarioCentavos: salario,
    linhas,
    baseCentavos: base,
    subtotalCentavos: subtotal,
    retencoes,
    totalRetencoesCentavos: totalRetencoes,
    totalNfCentavos: subtotal - totalRetencoes,
  };
}

// ── Formatação ──────────────────────────────────────────────────────────────

// Mesmo formato do R&S (propostasUi: toLocaleString pt-BR em BRL), partindo de centavos inteiros.
export function formatarCentavosBRL(centavos: number): string {
  if (!Number.isInteger(centavos)) throw new Error("Valor em centavos precisa ser inteiro.");
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const texto = (Math.floor(abs / 100) + (abs % 100) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return negativo ? `-${texto}` : texto;
}

export function formatarPercentualBp(bp: number): string {
  const inteiro = Math.floor(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return `${inteiro}%`;
  return `${inteiro},${String(frac).padStart(2, "0").replace(/0$/, "")}%`;
}

// ── Valor por extenso (pt-BR) ───────────────────────────────────────────────

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const ESCALAS: { singular: string; plural: string }[] = [
  { singular: "", plural: "" },
  { singular: "mil", plural: "mil" },
  { singular: "milhão", plural: "milhões" },
  { singular: "bilhão", plural: "bilhões" },
];

// 1 a 999.
function centenaPorExtenso(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

// 1 a 999.999.999.999 (até centenas de bilhões).
function inteiroPorExtenso(n: number): string {
  const grupos: number[] = [];
  for (let resto = n; resto > 0; resto = Math.floor(resto / 1000)) grupos.push(resto % 1000);
  const partes: { escala: number; valor: number; texto: string }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const v = grupos[i];
    if (v === 0) continue;
    // "mil" nunca "um mil"; milhão/bilhão levam o "um".
    const texto = i === 1 && v === 1 ? "mil" : `${centenaPorExtenso(v)} ${v === 1 ? ESCALAS[i].singular : ESCALAS[i].plural}`.trim();
    partes.push({ escala: i, valor: v, texto });
  }
  // Entre os dois últimos grupos usa-se "e" quando o último é < 100 ou centena redonda; nos demais, vírgula.
  return partes.reduce((acc, p, idx) => {
    if (idx === 0) return p.texto;
    const ultimo = idx === partes.length - 1;
    const liga = ultimo && (p.valor < 100 || p.valor % 100 === 0) ? " e " : ", ";
    return acc + liga + p.texto;
  }, "");
}

export function valorPorExtensoBRL(centavos: number): string {
  if (!Number.isInteger(centavos) || centavos < 0) throw new Error("Valor por extenso: informe centavos inteiros e não negativos.");
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  if (reais >= 1_000_000_000_000) throw new Error("Valor por extenso: valor grande demais.");
  const partes: string[] = [];
  if (reais > 0 || cents === 0) {
    // "de reais" quando o inteiro termina em milhão/bilhão redondo (um milhão de reais, dois bilhões de reais).
    const redondoEmMilhao = reais >= 1_000_000 && reais % 1_000_000 === 0;
    const nome = reais === 1 ? "real" : redondoEmMilhao ? "de reais" : "reais";
    partes.push(`${reais === 0 ? "zero" : inteiroPorExtenso(reais)} ${nome}`);
  }
  if (cents > 0) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  const texto = partes.join(" e ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
