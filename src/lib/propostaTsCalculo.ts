// Cálculo da proposta de Terceirização de Serviços (TS): lib pura, sem import de servidor (roda no client, no server e no harness).
// DECISÃO DO NEGÓCIO (Ölver): a planilha dele (LIMPEZA, LIMPEZA Maxsoy, PORTEIRO 2025/2026, ZTE) é a referência. Tudo em CENTAVOS INTEIROS e sem ponto flutuante.
// Os ENCARGOS são calculados sem arredondar no meio (como a planilha) e arredondados UMA vez, no total; as linhas de encargo são ajustadas em até 1 centavo para
// somarem exatamente esse total, então o que está impresso fecha. O preço é custo × (1 + ganho): não há tributos, despesas nem lucro separados.
// O MOT não é alterado: daqui só se importa a constante já exportada por ele.
import { BP_MAXIMO } from "@/lib/propostaMotCalculo";

// ── Parâmetros (tabela proposta_ts_parametros, pontos-base inteiros: 23% = 2300) ─────────────────────────────────────────────────
export interface ParametrosTs {
  fgts_bp: number;
  inss_bp: number;
  multa_fgts_bp: number;
  // Ganho sobre o CUSTO: o padrão de toda proposta e o piso (abaixo dele, só o gestor libera, com justificativa).
  ganho_padrao_bp: number;
  ganho_minimo_bp: number;
  // Ligado: adicionais e horas extras entram na base dos encargos. Desligado: só o salário (como a planilha original).
  encargos_sobre_adicionais: boolean;
}

// Linha inicial: FGTS, INSS e multa; o ganho fica por configurar até a diretoria cadastrar.
export const PARAMETROS_TS_INICIAIS: Readonly<ParametrosTs> = Object.freeze({
  fgts_bp: 800,
  inss_bp: 2300,
  multa_fgts_bp: 4000,
  ganho_padrao_bp: 0,
  ganho_minimo_bp: 0,
  encargos_sobre_adicionais: true,
});

export const CHAVES_ENCARGOS_TS = ["fgts_bp", "inss_bp", "multa_fgts_bp"] as const;
export const CHAVES_GANHO_TS = ["ganho_padrao_bp", "ganho_minimo_bp"] as const;
export const CHAVES_PARAMETROS_TS = Object.keys(PARAMETROS_TS_INICIAIS) as (keyof ParametrosTs)[];
// Colunas da tabela que o TS não usa mais (modelo antigo custo ÷ (1 − D) e cobertura): ficam no banco pelo histórico e são gravadas com 0.
export const COLUNAS_SEM_USO_TS = ["cobertura_bp", "iss_bp", "pis_bp", "cofins_bp", "irpj_bp", "csll_bp", "despesas_bp", "lucro_bp", "margem_minima_bp"] as const;
export { BP_MAXIMO };
export const GANHO_MAXIMO_BP = 100_000; // 1000%

// Tetos: cada valor em reais digitado vai até R$ 1.000.000,00 e há no máximo 1.000 efetivos por posto. Qualquer resultado que ainda assim passe de
// 2^53 é recusado (nunca arredondado em silêncio): ver `seguro`.
export const VALOR_MAXIMO_CENTAVOS = 100_000_000;
export const EFETIVOS_MAXIMO = 1000;

export const MSG_GANHO_TS_NAO_CONFIGURADO = "O percentual de ganho da Terceirização ainda não foi configurado pela diretoria.";
export const MSG_VALOR_GRANDE_DEMAIS = "Os valores informados são grandes demais para o cálculo.";

const bpEntre = (v: unknown, max: number): boolean => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;

export function parametrosTsValidos(p: unknown): p is ParametrosTs {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return CHAVES_ENCARGOS_TS.every((k) => bpEntre(o[k], BP_MAXIMO)) && CHAVES_GANHO_TS.every((k) => bpEntre(o[k], GANHO_MAXIMO_BP)) && typeof o.encargos_sobre_adicionais === "boolean";
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
const bpValido = (v: unknown, rotulo: string, max = BP_MAXIMO): number => {
  if (!bpEntre(v, max)) throw new Error(`${rotulo} deve ser um percentual em pontos-base inteiros de 0 a ${max}.`);
  return v as number;
};

// ── Encargos (como na planilha) ───────────────────────────────────────────────────────────────────────────────────────────────────
// BASES DE INSS E FGTS: ÚNICO PONTO DO CÓDIGO. Sobre a base B: férias = B/12; 1/3 = férias/3; 13º = B/12; aviso = B/12;
// FGTS incide sobre B + férias + 13º + aviso (sem o 1/3); INSS sobre B + 13º + aviso (sem férias nem 1/3); multa = % sobre o FGTS.
// Cada parcela exata é um numerador inteiro sobre o MESMO denominador (36 × 10000 × 10000), por isso nada é arredondado no meio.
const CHAVES_LINHAS_ENCARGO = ["ferias", "terco_ferias", "decimo_terceiro", "aviso_previo", "fgts", "inss", "multa_fgts"] as const;
const ROTULOS_LINHAS_ENCARGO: Record<(typeof CHAVES_LINHAS_ENCARGO)[number], string> = {
  ferias: "Férias", terco_ferias: "1/3 sobre férias", decimo_terceiro: "13º salário", aviso_previo: "Aviso prévio", fgts: "FGTS", inss: "INSS", multa_fgts: "Multa do FGTS",
};
const DENOMINADOR_ENCARGOS = BigInt(36) * BigInt(10000) * BigInt(10000);

export function encargosTs(baseCentavos: number, p: Pick<ParametrosTs, "fgts_bp" | "inss_bp" | "multa_fgts_bp">): { valores: number[]; totalCentavos: number } {
  const B = BigInt(seguro(baseCentavos));
  const fgts = BigInt(p.fgts_bp), inss = BigInt(p.inss_bp), multa = BigInt(p.multa_fgts_bp);
  const dozeAvos = B * BigInt(3) * BigInt(100_000_000); // B/12
  const numeradores = [
    dozeAvos, // férias
    B * BigInt(100_000_000), // 1/3 de férias = B/36
    dozeAvos, // 13º
    dozeAvos, // aviso prévio
    B * fgts * BigInt(450_000), // FGTS × B × 15/12
    B * inss * BigInt(420_000), // INSS × B × 14/12
    B * fgts * multa * BigInt(45), // multa × FGTS
  ];
  const soma = numeradores.reduce((s, n) => s + n, BigInt(0));
  const total = (soma * BigInt(2) + DENOMINADOR_ENCARGOS) / (DENOMINADOR_ENCARGOS * BigInt(2));
  // Maiores restos: parte de baixo de cada linha e os centavos que faltam para o total vão para as linhas de maior fração.
  const valores = numeradores.map((n) => Number(n / DENOMINADOR_ENCARGOS));
  const faltam = Number(total) - valores.reduce((s, v) => s + v, 0);
  numeradores
    .map((n, i) => ({ i, resto: n % DENOMINADOR_ENCARGOS }))
    .sort((a, b) => (a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1))
    .slice(0, faltam)
    .forEach(({ i }) => { valores[i] += 1; });
  return { valores, totalCentavos: seguro(Number(total)) };
}

// ── Posto ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type QuemPaga = "salmazos" | "cliente";
export type AdicionalTsEntrada =
  | { tipo: string; modo: "valor"; valorCentavos: number }
  | { tipo: string; modo: "percentual"; percentualBp: number };
export interface BeneficioTsEntrada {
  tipo: string;
  valorCentavos: number;
  quemPaga: QuemPaga;
}

export interface PostoTsEntrada {
  salarioCentavos: number;
  adicionais: AdicionalTsEntrada[];
  beneficios: BeneficioTsEntrada[];
  uniformeEpiCentavos: number;
  uniformeEpiQuemPaga: QuemPaga;
  insumosCentavos: number;
  insumosQuemPaga: QuemPaga;
  // Operação/supervisão: não tem "quem paga", sempre entra.
  operacaoCentavos: number;
  efetivos: number;
}

export interface LinhaTs {
  chave: string;
  rotulo: string;
  valorCentavos: number;
  // Percentual aplicado (pontos-base), quando a linha é um percentual de outra; null nas demais.
  percentualBp: number | null;
  // Subtotais (remuneração, encargos, benefícios, custo unitário): somam as linhas acima e não entram duas vezes na conta.
  subtotal: boolean;
  // Item que o cliente fornece/paga: fica registrado na proposta, com zero no custo.
  fornecidoPeloCliente: boolean;
}

export interface PostoTsCalculado {
  linhas: LinhaTs[];
  remuneracaoCentavos: number;
  baseEncargosCentavos: number;
  encargosCentavos: number;
  beneficiosCentavos: number;
  uniformeEpiCentavos: number;
  insumosCentavos: number;
  operacaoCentavos: number;
  custoUnitCentavos: number;
  efetivos: number;
  custoPostoCentavos: number;
}

const ROTULO_ADICIONAL: Record<string, string> = {
  insalubridade: "Insalubridade", periculosidade: "Periculosidade", assiduidade: "Assiduidade", noturno: "Adicional noturno", gratificacao: "Gratificação", hora_extra: "Horas extras", outro: "Outro adicional",
};
const ROTULO_BENEFICIO: Record<string, string> = {
  vale_transporte: "Vale-transporte", refeicao: "Refeição", cesta_basica: "Cesta básica", assistencia_medica: "Assistência médica", ajuda_de_custo: "Ajuda de custo", outro: "Outro benefício",
};

export function calcularPostoTs(entrada: PostoTsEntrada, parametros: ParametrosTs): PostoTsCalculado {
  const salario = entrada.salarioCentavos;
  if (typeof salario !== "number" || !Number.isInteger(salario) || salario <= 0) throw new Error("O salário precisa ser um valor em centavos inteiro e maior que zero.");
  if (salario > VALOR_MAXIMO_CENTAVOS) throw new Error("O salário passa do limite aceito pelo cálculo.");
  if (!Number.isInteger(entrada.efetivos) || entrada.efetivos < 1 || entrada.efetivos > EFETIVOS_MAXIMO) throw new Error(`A quantidade de efetivos vai de 1 a ${EFETIVOS_MAXIMO}.`);
  if (!parametrosTsValidos(parametros)) throw new Error("Percentuais inválidos: use pontos-base inteiros.");

  const linhas: LinhaTs[] = [];
  const add = (chave: string, rotulo: string, valorCentavos: number, extra: Partial<Pick<LinhaTs, "percentualBp" | "subtotal" | "fornecidoPeloCliente">> = {}) => {
    linhas.push({ chave, rotulo, valorCentavos, percentualBp: null, subtotal: false, fornecidoPeloCliente: false, ...extra });
    return valorCentavos;
  };
  // Item com "quem paga": do cliente fica na proposta com zero no custo (o valor informado é validado mesmo assim).
  const item = (chave: string, rotulo: string, valor: unknown, quemPaga: QuemPaga) => {
    const v = inteiroNaoNegativo(valor, rotulo);
    return quemPaga === "cliente" ? add(chave, rotulo, 0, { fornecidoPeloCliente: true }) : add(chave, rotulo, v);
  };

  // Remuneração = salário + adicionais e horas extras de valor + adicionais percentuais (percentual sobre o SALÁRIO).
  let remuneracao = add("salario", "Salário", salario);
  entrada.adicionais.forEach((a, i) => {
    const rotulo = ROTULO_ADICIONAL[a.tipo] ?? a.tipo;
    remuneracao += a.modo === "valor"
      ? add(`adicional_${i + 1}`, rotulo, inteiroNaoNegativo(a.valorCentavos, rotulo))
      : add(`adicional_${i + 1}`, rotulo, percentualDe(salario, bpValido(a.percentualBp, rotulo)), { percentualBp: a.percentualBp });
  });
  seguro(remuneracao);
  add("remuneracao", "Remuneração", remuneracao, { subtotal: true });

  const base = parametros.encargos_sobre_adicionais ? remuneracao : salario;
  const enc = encargosTs(base, parametros);
  const percentuais: Partial<Record<(typeof CHAVES_LINHAS_ENCARGO)[number], number>> = { fgts: parametros.fgts_bp, inss: parametros.inss_bp, multa_fgts: parametros.multa_fgts_bp };
  CHAVES_LINHAS_ENCARGO.forEach((k, i) => add(k, ROTULOS_LINHAS_ENCARGO[k], enc.valores[i], { percentualBp: percentuais[k] ?? null }));
  add("encargos", "Encargos", enc.totalCentavos, { subtotal: true });

  let beneficios = 0;
  entrada.beneficios.forEach((b, i) => {
    beneficios += item(`beneficio_${i + 1}`, ROTULO_BENEFICIO[b.tipo] ?? b.tipo, b.valorCentavos, b.quemPaga);
  });
  add("beneficios", "Benefícios", beneficios, { subtotal: true });

  const uniformeEpi = item("uniforme_epi", "Uniforme / EPI", entrada.uniformeEpiCentavos, entrada.uniformeEpiQuemPaga);
  const insumos = item("insumos", "Insumos", entrada.insumosCentavos, entrada.insumosQuemPaga);
  const operacao = add("operacao", "Operação", inteiroNaoNegativo(entrada.operacaoCentavos, "A operação"));

  const custoUnit = seguro(remuneracao + enc.totalCentavos + beneficios + uniformeEpi + insumos + operacao);
  add("custo_unitario", "Custo por efetivo", custoUnit, { subtotal: true });

  return {
    linhas,
    remuneracaoCentavos: remuneracao,
    baseEncargosCentavos: base,
    encargosCentavos: enc.totalCentavos,
    beneficiosCentavos: beneficios,
    uniformeEpiCentavos: uniformeEpi,
    insumosCentavos: insumos,
    operacaoCentavos: operacao,
    custoUnitCentavos: custoUnit,
    efetivos: entrada.efetivos,
    custoPostoCentavos: seguro(custoUnit * entrada.efetivos),
  };
}

// ── Preço ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Preço de UM valor de custo: round(custo × (10000 + ganho) ÷ 10000).
export function precoDoCustoTs(custoCentavos: number, ganhoBp: number): number {
  inteiroNaoNegativo(custoCentavos, "O custo", Number.MAX_SAFE_INTEGER);
  bpValido(ganhoBp, "O ganho", GANHO_MAXIMO_BP);
  return dividirArredondando(seguro(custoCentavos * (BP_MAXIMO + ganhoBp)), BP_MAXIMO);
}

// Ganho efetivo de um preço sobre o custo, em pontos-base (negativo quando o preço fica abaixo do custo). Só informativo: o bloqueio compara preços.
export function ganhoRealBp(custoCentavos: number, precoCentavos: number): number {
  if (!Number.isInteger(precoCentavos) || precoCentavos <= 0) throw new Error("O preço precisa ser um valor em centavos inteiro e maior que zero.");
  if (!Number.isInteger(custoCentavos) || custoCentavos <= 0) throw new Error("O custo precisa ser maior que zero.");
  // BigInt: (preço − custo) × 10000 passa de 2^53 em contratos grandes. Meio-para-cima no valor absoluto.
  const diferenca = BigInt(precoCentavos) - BigInt(custoCentavos);
  const absoluta = (diferenca < BigInt(0) ? -diferenca : diferenca) * BigInt(BP_MAXIMO);
  const bp = seguro(Number((absoluta * BigInt(2) + BigInt(custoCentavos)) / (BigInt(custoCentavos) * BigInt(2))));
  return diferenca < BigInt(0) ? -bp : bp;
}

// Ganho aplicado na proposta: o da própria proposta (só gestor/diretoria informa) ou o padrão vigente. Sem nenhum dos dois, não há preço.
export function ganhoAplicadoTs(p: ParametrosTs, ganhoDaPropostaBp: number | null | undefined): number {
  if (!parametrosTsValidos(p)) throw new Error("Percentuais inválidos: use pontos-base inteiros.");
  if (ganhoDaPropostaBp != null) return bpValido(ganhoDaPropostaBp, "O ganho da proposta", GANHO_MAXIMO_BP);
  if (p.ganho_padrao_bp === 0) throw new Error(MSG_GANHO_TS_NAO_CONFIGURADO);
  return p.ganho_padrao_bp;
}

// ── Serviço e proposta ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PostoTsPrecificado extends PostoTsCalculado {
  precoUnitCentavos: number;
  precoPostoCentavos: number;
}
export type ServicoTsEntrada =
  | { modo: "postos"; postos: PostoTsEntrada[]; precoManualCentavos?: number | null }
  | { modo: "fechado"; custoCentavos: number; precoManualCentavos?: number | null };

export interface ServicoTsCalculado {
  modo: "postos" | "fechado";
  postos: PostoTsPrecificado[];
  custoCentavos: number;
  precoCalculadoCentavos: number;
  precoManualCentavos: number | null;
  // Preço que vale: o manual, quando existe; senão o calculado.
  precoCentavos: number;
  ganhoRealBp: number;
  abaixoGanhoMinimo: boolean;
}

export function calcularServicoTs(entrada: ServicoTsEntrada, parametros: ParametrosTs, ganhoBp: number): ServicoTsCalculado {
  let postos: PostoTsPrecificado[] = [];
  let custo: number;
  let precoCalculado: number;
  if (entrada.modo === "postos") {
    if (entrada.postos.length === 0) throw new Error("Informe pelo menos um posto.");
    postos = entrada.postos.map((p) => {
      const c = calcularPostoTs(p, parametros);
      const precoUnit = precoDoCustoTs(c.custoUnitCentavos, ganhoBp);
      return { ...c, precoUnitCentavos: precoUnit, precoPostoCentavos: seguro(precoUnit * c.efetivos) };
    });
    custo = seguro(postos.reduce((s, p) => s + p.custoPostoCentavos, 0));
    precoCalculado = seguro(postos.reduce((s, p) => s + p.precoPostoCentavos, 0));
  } else {
    if (!Number.isInteger(entrada.custoCentavos) || entrada.custoCentavos <= 0 || entrada.custoCentavos > VALOR_MAXIMO_CENTAVOS) {
      throw new Error("O custo do serviço fechado precisa ser um valor em centavos inteiro e maior que zero.");
    }
    custo = entrada.custoCentavos;
    precoCalculado = precoDoCustoTs(custo, ganhoBp);
  }
  const manual = entrada.precoManualCentavos ?? null;
  if (manual !== null && (!Number.isInteger(manual) || manual <= 0)) throw new Error("O preço manual precisa ser um valor em centavos inteiro e maior que zero.");
  const preco = manual ?? precoCalculado;
  return {
    modo: entrada.modo,
    postos,
    custoCentavos: custo,
    precoCalculadoCentavos: precoCalculado,
    precoManualCentavos: manual,
    precoCentavos: preco,
    ganhoRealBp: ganhoRealBp(custo, preco),
    // Sem preço manual vale o percentual aplicado (o arredondamento de centavos não pode bloquear); com preço manual, ele não pode ficar abaixo do preço do ganho mínimo.
    abaixoGanhoMinimo: manual === null ? ganhoBp < parametros.ganho_minimo_bp : manual < precoDoCustoTs(custo, parametros.ganho_minimo_bp),
  };
}

export interface PropostaTsCalculada {
  parametros: ParametrosTs;
  ganhoBp: number;
  servicos: ServicoTsCalculado[];
  custoTotalCentavos: number;
  totalMensalCentavos: number;
}

export function calcularPropostaTs(entrada: { servicos: ServicoTsEntrada[]; parametros: ParametrosTs; ganhoBp?: number | null }): PropostaTsCalculada {
  if (entrada.servicos.length === 0) throw new Error("Informe pelo menos um serviço.");
  const ganhoBp = ganhoAplicadoTs(entrada.parametros, entrada.ganhoBp);
  const servicos = entrada.servicos.map((s) => calcularServicoTs(s, entrada.parametros, ganhoBp));
  return {
    parametros: entrada.parametros,
    ganhoBp,
    servicos,
    custoTotalCentavos: seguro(servicos.reduce((s, x) => s + x.custoCentavos, 0)),
    totalMensalCentavos: seguro(servicos.reduce((s, x) => s + x.precoCentavos, 0)),
  };
}
