// Cálculo da proposta de Terceirização de Serviços (TS): lib pura, sem import de servidor (roda no client, no server e no harness).
// DECISÃO DO NEGÓCIO (Ölver): tudo em CENTAVOS INTEIROS, arredondamento meio-para-cima LINHA A LINHA, por efetivo; cada linha parte dos valores JÁ
// ARREDONDADOS das linhas de que depende, então o que está impresso soma exatamente o total. Nada de ponto flutuante nas contas.
// Encargos do TS vêm da planilha do Ölver (NÃO da planilha do MOT) e incidem sobre a REMUNERAÇÃO COMPLETA do posto.
// O MOT não é alterado: daqui só se importam constantes e formatadores já exportados por ele (dividirArredondando não é exportado lá, então é repetido aqui).
import { BP_MAXIMO } from "@/lib/propostaMotCalculo";

// ── Parâmetros (tabela proposta_ts_parametros, pontos-base inteiros: 23% = 2300) ─────────────────────────────────────────────────
export interface ParametrosTs {
  fgts_bp: number;
  inss_bp: number;
  multa_fgts_bp: number;
  cobertura_bp: number;
  iss_bp: number;
  pis_bp: number;
  cofins_bp: number;
  irpj_bp: number;
  csll_bp: number;
  despesas_bp: number;
  lucro_bp: number;
  margem_minima_bp: number;
}

// Linha inicial da migration (supabase/migration_propostas_ts.sql): só FGTS, INSS e multa; o preço fica por configurar até a diretoria cadastrar.
export const PARAMETROS_TS_INICIAIS: Readonly<ParametrosTs> = Object.freeze({
  fgts_bp: 800,
  inss_bp: 2300,
  multa_fgts_bp: 4000,
  cobertura_bp: 0,
  iss_bp: 0,
  pis_bp: 0,
  cofins_bp: 0,
  irpj_bp: 0,
  csll_bp: 0,
  despesas_bp: 0,
  lucro_bp: 0,
  margem_minima_bp: 0,
});

export const CHAVES_PARAMETROS_TS = Object.keys(PARAMETROS_TS_INICIAIS) as (keyof ParametrosTs)[];
export { BP_MAXIMO };

// Tetos: cada valor em reais digitado vai até R$ 1.000.000,00 e há no máximo 1.000 efetivos por posto. Qualquer resultado que ainda assim passe de
// 2^53 é recusado (nunca arredondado em silêncio): ver `seguro`.
export const VALOR_MAXIMO_CENTAVOS = 100_000_000;
export const EFETIVOS_MAXIMO = 1000;

export const MSG_PRECO_TS_NAO_CONFIGURADO = "Os percentuais de preço da Terceirização ainda não foram configurados pela diretoria.";
export const MSG_DEDUCOES_TS_INVALIDAS = "Os percentuais de preço da Terceirização somam 100% ou mais (tributos + despesas + lucro): confira com a diretoria.";
export const MSG_VALOR_GRANDE_DEMAIS = "Os valores informados são grandes demais para o cálculo.";

export function parametrosTsValidos(p: unknown): p is ParametrosTs {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return CHAVES_PARAMETROS_TS.every((k) => typeof o[k] === "number" && Number.isInteger(o[k]) && (o[k] as number) >= 0 && (o[k] as number) <= BP_MAXIMO);
}

// ── Aritmética inteira ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function seguro(n: number): number {
  if (!Number.isSafeInteger(n)) throw new Error(MSG_VALOR_GRANDE_DEMAIS);
  return n;
}
// Divisão inteira com arredondamento meio-para-cima (só para não negativos): 0,5 centavo sobe.
function dividirArredondando(numerador: number, denominador: number): number {
  return Math.floor(seguro(numerador * 2 + denominador) / (denominador * 2));
}
const percentualDe = (valorCentavos: number, bp: number): number => dividirArredondando(seguro(valorCentavos * bp), BP_MAXIMO);

const inteiroNaoNegativo = (v: unknown, rotulo: string, max = VALOR_MAXIMO_CENTAVOS): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) throw new Error(`${rotulo} deve ser um valor em centavos inteiro entre 0 e ${max}.`);
  return v;
};
const bpValido = (v: unknown, rotulo: string): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > BP_MAXIMO) throw new Error(`${rotulo} deve ser um percentual em pontos-base inteiros de 0 a ${BP_MAXIMO}.`);
  return v;
};

// ── Posto ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type AdicionalTsEntrada =
  | { tipo: string; modo: "valor"; valorCentavos: number }
  | { tipo: string; modo: "percentual"; percentualBp: number };
export interface BeneficioTsEntrada {
  tipo: string;
  valorCentavos: number;
}
export type QuemFornece = "salmazos" | "cliente";
export interface FornecimentoTs {
  equipamentos: QuemFornece;
  produtos: QuemFornece;
}
// REGRA (a confirmar): os INSUMOS do posto (produtos e equipamentos) entram no custo só quando a Salmazos fornece equipamentos OU produtos.
// A OPERAÇÃO (custo de operação/supervisão do contrato) é outro campo e SEMPRE entra no custo, seja quem for que fornece.
export const insumosContam = (f: FornecimentoTs): boolean => f.equipamentos === "salmazos" || f.produtos === "salmazos";

export interface PostoTsEntrada {
  salarioCentavos: number;
  adicionais: AdicionalTsEntrada[];
  beneficios: BeneficioTsEntrada[];
  uniformeEpiCentavos: number;
  insumosCentavos: number;
  operacaoCentavos: number;
  efetivos: number;
  // null/ausente = usa o padrão global (cobertura_bp dos parâmetros).
  coberturaBpOverride?: number | null;
}

export interface LinhaTs {
  chave: string;
  rotulo: string;
  valorCentavos: number;
  // Percentual aplicado (pontos-base), quando a linha é um percentual de outra; null nas demais.
  percentualBp: number | null;
  // Subtotais (remuneração, encargos, benefícios, custo unitário): somam as linhas acima e não entram duas vezes na conta.
  subtotal: boolean;
}

export interface PostoTsCalculado {
  linhas: LinhaTs[];
  remuneracaoCentavos: number;
  encargosCentavos: number;
  beneficiosCentavos: number;
  uniformeEpiCentavos: number;
  insumosCentavos: number;
  operacaoCentavos: number;
  coberturaCentavos: number;
  coberturaBp: number;
  custoUnitCentavos: number;
  efetivos: number;
  custoPostoCentavos: number;
}

// BASES DE INSS E FGTS: ÚNICO PONTO DO CÓDIGO (pode mudar — confirmar com contador). Hoje:
//   FGTS incide sobre rem + férias + 13º + aviso (sem o 1/3 de férias);  INSS incide sobre rem + 13º + aviso (sem férias nem 1/3).
export function basesEncargosTs(r: { remuneracao: number; ferias: number; decimoTerceiro: number; aviso: number }): { baseFgts: number; baseInss: number } {
  return {
    baseFgts: r.remuneracao + r.ferias + r.decimoTerceiro + r.aviso,
    baseInss: r.remuneracao + r.decimoTerceiro + r.aviso,
  };
}

const ROTULO_ADICIONAL: Record<string, string> = {
  insalubridade: "Insalubridade", periculosidade: "Periculosidade", assiduidade: "Assiduidade", noturno: "Adicional noturno", gratificacao: "Gratificação", outro: "Outro adicional",
};
const ROTULO_BENEFICIO: Record<string, string> = { vale_transporte: "Vale-transporte", refeicao: "Refeição", cesta_basica: "Cesta básica", outro: "Outro benefício" };

export function calcularPostoTs(entrada: PostoTsEntrada, parametros: ParametrosTs, opcoes: { insumosContam: boolean }): PostoTsCalculado {
  const salario = entrada.salarioCentavos;
  if (typeof salario !== "number" || !Number.isInteger(salario) || salario <= 0) throw new Error("O salário precisa ser um valor em centavos inteiro e maior que zero.");
  if (salario > VALOR_MAXIMO_CENTAVOS) throw new Error("O salário passa do limite aceito pelo cálculo.");
  if (!Number.isInteger(entrada.efetivos) || entrada.efetivos < 1 || entrada.efetivos > EFETIVOS_MAXIMO) throw new Error(`A quantidade de efetivos vai de 1 a ${EFETIVOS_MAXIMO}.`);
  if (!parametrosTsValidos(parametros)) throw new Error("Percentuais inválidos: use pontos-base inteiros de 0 a 10000.");
  const coberturaBp = entrada.coberturaBpOverride == null ? parametros.cobertura_bp : bpValido(entrada.coberturaBpOverride, "A cobertura do posto");

  const linhas: LinhaTs[] = [];
  const add = (chave: string, rotulo: string, valorCentavos: number, percentualBp: number | null = null, subtotal = false) => {
    linhas.push({ chave, rotulo, valorCentavos, percentualBp, subtotal });
    return valorCentavos;
  };

  // Remuneração = salário + adicionais de valor + adicionais percentuais (percentual sobre o SALÁRIO).
  let remuneracao = add("salario", "Salário", salario);
  entrada.adicionais.forEach((a, i) => {
    const rotulo = ROTULO_ADICIONAL[a.tipo] ?? a.tipo;
    remuneracao += a.modo === "valor"
      ? add(`adicional_${i + 1}`, rotulo, inteiroNaoNegativo(a.valorCentavos, rotulo))
      : add(`adicional_${i + 1}`, rotulo, percentualDe(salario, bpValido(a.percentualBp, rotulo)), a.percentualBp);
  });
  seguro(remuneracao);
  add("remuneracao", "Remuneração", remuneracao, null, true);

  // Encargos (derivados de 1/12, sem coluna de parâmetro).
  const ferias = add("ferias", "Férias", dividirArredondando(remuneracao, 12));
  const terco = add("terco_ferias", "1/3 sobre férias", dividirArredondando(ferias, 3));
  const decimoTerceiro = add("decimo_terceiro", "13º salário", dividirArredondando(remuneracao, 12));
  const aviso = add("aviso_previo", "Aviso prévio", dividirArredondando(remuneracao, 12));
  const { baseFgts, baseInss } = basesEncargosTs({ remuneracao, ferias, decimoTerceiro, aviso });
  const fgts = add("fgts", "FGTS", percentualDe(baseFgts, parametros.fgts_bp), parametros.fgts_bp);
  const inss = add("inss", "INSS", percentualDe(baseInss, parametros.inss_bp), parametros.inss_bp);
  const multa = add("multa_fgts", "Multa do FGTS", percentualDe(fgts, parametros.multa_fgts_bp), parametros.multa_fgts_bp);
  const encargos = ferias + terco + decimoTerceiro + aviso + fgts + inss + multa;
  add("encargos", "Encargos", encargos, null, true);

  let beneficios = 0;
  entrada.beneficios.forEach((b, i) => {
    const rotulo = ROTULO_BENEFICIO[b.tipo] ?? b.tipo;
    beneficios += add(`beneficio_${i + 1}`, rotulo, inteiroNaoNegativo(b.valorCentavos, rotulo));
  });
  add("beneficios", "Benefícios", beneficios, null, true);

  const uniformeEpi = add("uniforme_epi", "Uniforme / EPI", inteiroNaoNegativo(entrada.uniformeEpiCentavos, "O uniforme/EPI"));
  // Insumos (produtos e equipamentos) só entram quando a Salmazos fornece; a linha aparece sempre (zerada quando não entra) para o PDF mostrar o que ficou de fora.
  const insumos = add("insumos", "Insumos", opcoes.insumosContam ? inteiroNaoNegativo(entrada.insumosCentavos, "Os insumos") : 0);
  // Operação/supervisão: sempre entra (não depende de quem fornece equipamentos e produtos).
  const operacao = add("operacao", "Operação", inteiroNaoNegativo(entrada.operacaoCentavos, "A operação"));
  const cobertura = add("cobertura", "Cobertura de ausências", percentualDe(remuneracao + encargos + beneficios, coberturaBp), coberturaBp);

  const custoUnit = seguro(remuneracao + encargos + beneficios + uniformeEpi + insumos + operacao + cobertura);
  add("custo_unitario", "Custo por efetivo", custoUnit, null, true);
  const custoPosto = seguro(custoUnit * entrada.efetivos);

  return {
    linhas,
    remuneracaoCentavos: remuneracao,
    encargosCentavos: encargos,
    beneficiosCentavos: beneficios,
    uniformeEpiCentavos: uniformeEpi,
    insumosCentavos: insumos,
    operacaoCentavos: operacao,
    coberturaCentavos: cobertura,
    coberturaBp,
    custoUnitCentavos: custoUnit,
    efetivos: entrada.efetivos,
    custoPostoCentavos: custoPosto,
  };
}

// ── Preço ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface DeducoesPrecoTs {
  tributosBp: number;
  despesasBp: number;
  lucroBp: number;
  totalBp: number;
}
export function deducoesPrecoTs(p: ParametrosTs): DeducoesPrecoTs {
  const tributosBp = p.iss_bp + p.pis_bp + p.cofins_bp + p.irpj_bp + p.csll_bp;
  return { tributosBp, despesasBp: p.despesas_bp, lucroBp: p.lucro_bp, totalBp: tributosBp + p.despesas_bp + p.lucro_bp };
}

// D = tributos + despesas + lucro. D == 0 = a diretoria ainda não configurou o preço (recusa, nunca vende a preço de custo sem querer);
// D >= 10000 tornaria o divisor zero ou negativo.
export function exigirPrecoConfigurado(p: ParametrosTs): DeducoesPrecoTs {
  if (!parametrosTsValidos(p)) throw new Error("Percentuais inválidos: use pontos-base inteiros de 0 a 10000.");
  const d = deducoesPrecoTs(p);
  if (d.totalBp === 0) throw new Error(MSG_PRECO_TS_NAO_CONFIGURADO);
  if (d.totalBp >= BP_MAXIMO) throw new Error(MSG_DEDUCOES_TS_INVALIDAS);
  return d;
}

// Preço de UM valor de custo: round(custo × 10000 ÷ (10000 − D)).
export function precoDoCustoTs(custoCentavos: number, parametros: ParametrosTs): number {
  const d = exigirPrecoConfigurado(parametros);
  inteiroNaoNegativo(custoCentavos, "O custo", Number.MAX_SAFE_INTEGER);
  return seguro(dividirArredondando(seguro(custoCentavos * BP_MAXIMO), BP_MAXIMO - d.totalBp));
}

// Margem real de um preço (em pontos-base; pode ser negativa): 10000 − tributos − despesas − custo×10000/preço.
// Com o preço calculado dá o lucro_bp (a menos do arredondamento); com preço manual mostra o que sobra de verdade.
export function margemRealBp(custoCentavos: number, precoCentavos: number, parametros: ParametrosTs): number {
  if (!Number.isInteger(precoCentavos) || precoCentavos <= 0) throw new Error("O preço precisa ser um valor em centavos inteiro e maior que zero.");
  inteiroNaoNegativo(custoCentavos, "O custo", Number.MAX_SAFE_INTEGER);
  const d = deducoesPrecoTs(parametros);
  const fracaoCusto = dividirArredondando(seguro(custoCentavos * BP_MAXIMO), precoCentavos);
  return BP_MAXIMO - d.tributosBp - d.despesasBp - fracaoCusto;
}

// ISS pode ter override por PROPOSTA (só a diretoria; a regra de quem pode é do backend). O valor efetivo vai para o snapshot.
export function aplicarOverrideIss(p: ParametrosTs, issOverrideBp: number | null | undefined): ParametrosTs {
  if (issOverrideBp == null) return p;
  return { ...p, iss_bp: bpValido(issOverrideBp, "O ISS da proposta") };
}

// ── Serviço e proposta ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PostoTsPrecificado extends PostoTsCalculado {
  precoUnitCentavos: number;
  precoPostoCentavos: number;
}
export type ServicoTsEntrada =
  | { modo: "postos"; fornecimento: FornecimentoTs; postos: PostoTsEntrada[]; precoManualCentavos?: number | null }
  | { modo: "fechado"; custoCentavos: number; precoManualCentavos?: number | null };

export interface ServicoTsCalculado {
  modo: "postos" | "fechado";
  postos: PostoTsPrecificado[];
  custoCentavos: number;
  precoCalculadoCentavos: number;
  precoManualCentavos: number | null;
  // Preço que vale: o manual, quando existe; senão o calculado.
  precoCentavos: number;
  margemRealBp: number;
  abaixoMargemMinima: boolean;
}

export function calcularServicoTs(entrada: ServicoTsEntrada, parametros: ParametrosTs): ServicoTsCalculado {
  exigirPrecoConfigurado(parametros);
  let postos: PostoTsPrecificado[] = [];
  let custo: number;
  let precoCalculado: number;
  if (entrada.modo === "postos") {
    if (entrada.postos.length === 0) throw new Error("Informe pelo menos um posto.");
    const contam = insumosContam(entrada.fornecimento);
    postos = entrada.postos.map((p) => {
      const c = calcularPostoTs(p, parametros, { insumosContam: contam });
      const precoUnit = precoDoCustoTs(c.custoUnitCentavos, parametros);
      return { ...c, precoUnitCentavos: precoUnit, precoPostoCentavos: seguro(precoUnit * c.efetivos) };
    });
    custo = seguro(postos.reduce((s, p) => s + p.custoPostoCentavos, 0));
    precoCalculado = seguro(postos.reduce((s, p) => s + p.precoPostoCentavos, 0));
  } else {
    if (!Number.isInteger(entrada.custoCentavos) || entrada.custoCentavos <= 0 || entrada.custoCentavos > VALOR_MAXIMO_CENTAVOS) {
      throw new Error("O custo do serviço fechado precisa ser um valor em centavos inteiro e maior que zero.");
    }
    custo = entrada.custoCentavos;
    precoCalculado = precoDoCustoTs(custo, parametros);
  }
  const manual = entrada.precoManualCentavos ?? null;
  if (manual !== null && (!Number.isInteger(manual) || manual <= 0)) throw new Error("O preço manual precisa ser um valor em centavos inteiro e maior que zero.");
  const preco = manual ?? precoCalculado;
  const margem = margemRealBp(custo, preco, parametros);
  return {
    modo: entrada.modo,
    postos,
    custoCentavos: custo,
    precoCalculadoCentavos: precoCalculado,
    precoManualCentavos: manual,
    precoCentavos: preco,
    margemRealBp: margem,
    abaixoMargemMinima: margem < parametros.margem_minima_bp,
  };
}

export interface PropostaTsCalculada {
  // Parâmetros EFETIVOS (com o override de ISS aplicado): é o que o snapshot congela.
  parametros: ParametrosTs;
  servicos: ServicoTsCalculado[];
  custoTotalCentavos: number;
  totalMensalCentavos: number;
}

export function calcularPropostaTs(entrada: { servicos: ServicoTsEntrada[]; parametros: ParametrosTs; issOverrideBp?: number | null }): PropostaTsCalculada {
  if (entrada.servicos.length === 0) throw new Error("Informe pelo menos um serviço.");
  const parametros = aplicarOverrideIss(entrada.parametros, entrada.issOverrideBp);
  const servicos = entrada.servicos.map((s) => calcularServicoTs(s, parametros));
  return {
    parametros,
    servicos,
    custoTotalCentavos: seguro(servicos.reduce((s, x) => s + x.custoCentavos, 0)),
    totalMensalCentavos: seguro(servicos.reduce((s, x) => s + x.precoCentavos, 0)),
  };
}
