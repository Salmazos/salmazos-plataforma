// Proposta de Terceirização de Serviços (TS): conteúdo editável, validação, constantes e snapshot da revisão.
// Módulo sem imports de servidor: roda no client, no server e no harness. Não importa propostaModelos (que, na 2C, passa a despachar para cá), para não haver ciclo.
import { z } from "zod";
import { textoDesenhavel } from "@/lib/propostaTexto";
import { MAX_CLAUSULAS_ADICIONAIS, clausulaAdicional } from "@/lib/propostaClausulas";
import { emailParaAssinatura } from "@/lib/propostas";
import { condicoesMotSchema } from "@/lib/propostaMot";
import { formatarCentavosBRL, valorPorExtensoBRL } from "@/lib/propostaMotCalculo";
import {
  BP_MAXIMO, CHAVES_PARAMETROS_TS, EFETIVOS_MAXIMO, MSG_DEDUCOES_TS_INVALIDAS, MSG_PRECO_TS_NAO_CONFIGURADO, MSG_VALOR_GRANDE_DEMAIS, VALOR_MAXIMO_CENTAVOS,
  calcularPropostaTs, deducoesPrecoTs, parametrosTsValidos,
  type LinhaTs, type ParametrosTs, type PropostaTsCalculada, type ServicoTsEntrada,
} from "@/lib/propostaTsCalculo";

// Versão do template do TS, PRÓPRIA (cada modelo evolui sozinho; revisões antigas guardam a versão que usaram).
export const TEMPLATE_VERSAO_TS = 1;

export const MAX_SERVICOS_TS = 10;
export const MAX_POSTOS_TS = 20;
export const MAX_ADICIONAIS_TS = 10;
export const MAX_BENEFICIOS_TS = 10;
export const MAX_TEXTO_INTRODUTORIO_TS = 1000;
export const HORAS_MENSAIS_MAXIMO = 744; // 31 dias × 24 h
const MAX_NOME = 120, MAX_DESCRICAO = 300, MAX_FUNCAO = 100, MAX_ESCALA_TEXTO = 120, MAX_JUSTIFICATIVA = 500, MAX_CARGO = 100;

export const TITULO_TS = "PROPOSTA COMERCIAL: TERCEIRIZAÇÃO DE SERVIÇOS";
// PROVISÓRIO até haver o Word do TS (a 2E troca pelo texto aprovado).
export const TEXTO_INTRODUTORIO_PADRAO_TS = "Vimos através desta, apresentar nossa Proposta de Terceirização de Serviços.";

// ── Constantes de escalas e tipos ────────────────────────────────────────────────────────────────────────────────────────────────
export const ESCALAS_TS = [
  { codigo: "44h", rotulo: "44h semanais" },
  { codigo: "12x36", rotulo: "12x36" },
  { codigo: "5x2", rotulo: "5x2" },
  { codigo: "6x1", rotulo: "6x1" },
  { codigo: "outra", rotulo: "Outra (descrever)" },
] as const;
export const CODIGOS_ESCALA_TS = ESCALAS_TS.map((e) => e.codigo) as unknown as readonly [string, ...string[]];

export const TIPOS_BENEFICIO_TS = [
  { codigo: "vale_transporte", rotulo: "Vale-transporte" },
  { codigo: "refeicao", rotulo: "Refeição" },
  { codigo: "cesta_basica", rotulo: "Cesta básica" },
  { codigo: "outro", rotulo: "Outro benefício" },
] as const;
export const TIPOS_ADICIONAL_TS = [
  { codigo: "insalubridade", rotulo: "Insalubridade" },
  { codigo: "periculosidade", rotulo: "Periculosidade" },
  { codigo: "assiduidade", rotulo: "Assiduidade" },
  { codigo: "noturno", rotulo: "Adicional noturno" },
  { codigo: "gratificacao", rotulo: "Gratificação" },
  { codigo: "outro", rotulo: "Outro adicional" },
] as const;
const codigos = <T extends readonly { codigo: string }[]>(l: T) => l.map((x) => x.codigo) as unknown as readonly [string, ...string[]];

// ── Conteúdo editável (propostas.conteudo no modelo TS) ──────────────────────────────────────────────────────────────────────────
const naoVazio = (rotulo: string, max: number) =>
  z.string({ error: `Preencha ${rotulo}.` }).trim().min(1, `Preencha ${rotulo}.`).max(max, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} vai até ${max} caracteres.`)
    .refine((t) => textoDesenhavel(t) !== "", `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} só tem caracteres que o PDF não consegue imprimir.`);
const opcional = (rotulo: string, max: number) =>
  z.string().trim().max(max, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} vai até ${max} caracteres.`)
    .refine((t) => t === "" || textoDesenhavel(t) !== "", `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} só tem caracteres que o PDF não consegue imprimir.`)
    .optional().nullable();

const msgTeto = `passa do limite de ${formatarCentavosBRL(VALOR_MAXIMO_CENTAVOS)}.`;
const centavosPositivos = (rotulo: string) =>
  z.number({ error: `Informe ${rotulo} em reais (maior que zero).` }).int(`${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} deve ser um valor em centavos inteiros.`)
    .min(1, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} precisa ser maior que zero.`).max(VALOR_MAXIMO_CENTAVOS, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} ${msgTeto}`);
const centavosNaoNegativos = (rotulo: string) =>
  z.number({ error: `Informe ${rotulo} em reais.` }).int(`${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} deve ser um valor em centavos inteiros.`)
    .min(0, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} não pode ser negativo.`).max(VALOR_MAXIMO_CENTAVOS, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} ${msgTeto}`);
const percentualBp = (rotulo: string, min = 0) =>
  z.number({ error: `Informe ${rotulo} em pontos-base (ex.: 2000 para 20%).` }).int(`${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} deve ser inteiro em pontos-base.`)
    .min(min, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} deve ser de ${min} a ${BP_MAXIMO} pontos-base.`).max(BP_MAXIMO, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} deve ser de ${min} a ${BP_MAXIMO} pontos-base.`);

// Rótulo livre só para o tipo "outro" (texto que aparece na planilha). Nunca entra em cálculo; nos tipos fixos o rótulo vem do tipo e o campo enviado é descartado.
export const MAX_ROTULO_TS = 60;
type NomeItemTs = "adicional" | "benefício";
function validarRotuloOutro(item: { tipo: string; rotulo?: unknown }, ctx: z.RefinementCtx, nome: NomeItemTs): void {
  if (item.tipo !== "outro") return;
  const r = typeof item.rotulo === "string" ? item.rotulo.trim() : "";
  const problema =
    r === "" ? `Descreva o ${nome} escolhido como "Outro" (de 1 a ${MAX_ROTULO_TS} caracteres).`
    : r.length > MAX_ROTULO_TS ? `A descrição do ${nome} vai até ${MAX_ROTULO_TS} caracteres.`
    : /[<>]/.test(r) ? `A descrição do ${nome} não pode ter HTML (os sinais < e >).`
    : /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(r) ? `A descrição do ${nome} deve ser um texto de uma linha só.`
    : textoDesenhavel(r) === "" ? `A descrição do ${nome} só tem caracteres que o PDF não consegue imprimir.`
    : null;
  if (problema) ctx.addIssue({ code: "custom", path: ["rotulo"], message: problema });
}
// Tipo fixo: descarta o rótulo; "outro": grava o rótulo aparado e já no alfabeto que o PDF desenha.
type SemRotuloBruto<T> = T extends unknown ? Omit<T, "rotulo"> & { rotulo?: string } : never;
const normalizarRotulo = <T extends { tipo: string; rotulo?: unknown }>(item: T): SemRotuloBruto<T> => {
  const { rotulo, ...resto } = item;
  return (item.tipo === "outro" ? { ...resto, rotulo: textoDesenhavel(String(rotulo).trim()) } : resto) as SemRotuloBruto<T>;
};

export const adicionalTsSchema = z.discriminatedUnion("modo", [
  z.object({ tipo: z.enum(codigos(TIPOS_ADICIONAL_TS), { error: "Tipo de adicional inválido." }), rotulo: z.unknown().optional(), modo: z.literal("valor"), valor_centavos: centavosPositivos("o valor do adicional") }),
  z.object({ tipo: z.enum(codigos(TIPOS_ADICIONAL_TS), { error: "Tipo de adicional inválido." }), rotulo: z.unknown().optional(), modo: z.literal("percentual"), percentual_bp: percentualBp("o percentual do adicional", 1) }),
], { error: "Adicional inválido." }).superRefine((a, ctx) => validarRotuloOutro(a, ctx, "adicional")).transform(normalizarRotulo);

export const beneficioTsSchema = z.object({
  tipo: z.enum(codigos(TIPOS_BENEFICIO_TS), { error: "Tipo de benefício inválido." }),
  rotulo: z.unknown().optional(),
  valor_centavos: centavosPositivos("o valor do benefício"),
}).superRefine((b, ctx) => validarRotuloOutro(b, ctx, "benefício")).transform(normalizarRotulo);

export const postoTsSchema = z.object({
  funcao: naoVazio("a função", MAX_FUNCAO),
  escala: z.enum(CODIGOS_ESCALA_TS, { error: "Escolha a escala." }),
  escala_texto: opcional("a descrição da escala", MAX_ESCALA_TEXTO),
  horas_mensais: z.number({ error: "Informe as horas mensais." }).int("As horas mensais devem ser inteiras.").min(1, "As horas mensais precisam ser maiores que zero.").max(HORAS_MENSAIS_MAXIMO, `As horas mensais vão até ${HORAS_MENSAIS_MAXIMO}.`),
  efetivos: z.number({ error: "Informe o número de efetivos." }).int("Os efetivos devem ser um número inteiro.").min(1, "Informe pelo menos 1 efetivo.").max(EFETIVOS_MAXIMO, `Use no máximo ${EFETIVOS_MAXIMO} efetivos por posto.`),
  salario_centavos: centavosPositivos("o salário"),
  adicionais: z.array(adicionalTsSchema).max(MAX_ADICIONAIS_TS, `Use no máximo ${MAX_ADICIONAIS_TS} adicionais por posto.`).default([]),
  beneficios: z.array(beneficioTsSchema).max(MAX_BENEFICIOS_TS, `Use no máximo ${MAX_BENEFICIOS_TS} benefícios por posto.`).default([]),
  uniforme_epi_centavos: centavosNaoNegativos("o uniforme/EPI").default(0),
  // Insumos = produtos e equipamentos do posto: só entram no custo quando a Salmazos fornece (a confirmar). Operação = custo de operação/supervisão: sempre entra.
  insumos_centavos: centavosNaoNegativos("os insumos").default(0),
  operacao_centavos: centavosNaoNegativos("a operação").default(0),
  // null/ausente = usa a cobertura padrão dos parâmetros.
  cobertura_bp_override: percentualBp("a cobertura do posto").nullable().optional(),
}).refine((p) => p.escala !== "outra" || !!p.escala_texto?.trim(), { path: ["escala_texto"], message: "Descreva a escala." });
export type PostoTs = z.infer<typeof postoTsSchema>;

const fornecimentoSchema = z.object({
  equipamentos: z.enum(["salmazos", "cliente"], { error: "Informe quem fornece os equipamentos." }),
  produtos: z.enum(["salmazos", "cliente"], { error: "Informe quem fornece os produtos." }),
});

const servicoBase = z.object({
  nome: naoVazio("o nome do serviço", MAX_NOME),
  descricao: opcional("a descrição do serviço", MAX_DESCRICAO),
  fornecimento: fornecimentoSchema,
  // Preço manual: só a diretoria o informa (conferido pelo backend, 2C); a margem mínima e a justificativa também são regra de backend.
  preco_manual_centavos: centavosPositivos("o preço manual").nullable().optional(),
  justificativa_preco_manual: opcional("a justificativa", MAX_JUSTIFICATIVA),
});
export const servicoTsSchema = z.discriminatedUnion("modo", [
  servicoBase.extend({
    modo: z.literal("postos"),
    postos: z.array(postoTsSchema, { error: "Informe pelo menos um posto." }).min(1, "Informe pelo menos um posto.").max(MAX_POSTOS_TS, `Use no máximo ${MAX_POSTOS_TS} postos por serviço.`),
  }),
  servicoBase.extend({
    modo: z.literal("fechado"),
    // Serviço fechado: o custo é digitado (sem folha) e entra direto no cálculo de preço.
    fechado: z.object({ descricao: naoVazio("a descrição do custo", MAX_DESCRICAO), custo_centavos: centavosPositivos("o custo do serviço") }),
  }),
], { error: "Serviço inválido." });
export type ServicoTs = z.infer<typeof servicoTsSchema>;

export const conteudoTsSchema = z.object({
  texto_introdutorio: z.string().trim().max(MAX_TEXTO_INTRODUTORIO_TS, `O texto introdutório vai até ${MAX_TEXTO_INTRODUTORIO_TS} caracteres.`)
    .refine((t) => t === "" || textoDesenhavel(t) !== "", "O texto introdutório só tem caracteres que o PDF não consegue imprimir.").optional().nullable(),
  cargo_supervisao: opcional("o cargo", MAX_CARGO),
  servicos: z.array(servicoTsSchema, { error: "Informe pelo menos um serviço." }).min(1, "Informe pelo menos um serviço.").max(MAX_SERVICOS_TS, `Use no máximo ${MAX_SERVICOS_TS} serviços.`),
  condicoes: condicoesMotSchema.prefault({}),
  clausulas_adicionais: z.array(clausulaAdicional, { error: "As cláusulas adicionais devem ser uma lista de textos." }).max(MAX_CLAUSULAS_ADICIONAIS, `Use no máximo ${MAX_CLAUSULAS_ADICIONAIS} cláusulas adicionais.`).default([]),
  // Justificativa do GESTOR para liberar uma margem abaixo do mínimo (obrigatória nesse caso; ignorada quando a margem está dentro do mínimo). Quem libera e quando é
  // gravado pelo SERVIDOR no snapshot e na auditoria: o que vier do navegador sobre isso é descartado.
  justificativa_margem_minima: opcional("a justificativa da margem", MAX_JUSTIFICATIVA),
  // Override do ISS desta proposta, em pontos-base. SÓ A DIRETORIA pode informar (conferido pelo backend, 2C); o valor efetivo vai para o snapshot.
  iss_override_bp: percentualBp("o ISS da proposta").nullable().optional(),
});
export type ConteudoTs = z.infer<typeof conteudoTsSchema>;

// Entrada do cálculo (camelCase) a partir do conteúdo validado.
export function servicoParaCalculo(s: ServicoTs): ServicoTsEntrada {
  const precoManualCentavos = s.preco_manual_centavos ?? null;
  if (s.modo === "fechado") return { modo: "fechado", custoCentavos: s.fechado.custo_centavos, precoManualCentavos };
  return {
    modo: "postos",
    fornecimento: s.fornecimento,
    precoManualCentavos,
    postos: s.postos.map((p) => ({
      salarioCentavos: p.salario_centavos,
      adicionais: p.adicionais.map((a) => (a.modo === "valor" ? { tipo: a.tipo, modo: "valor" as const, valorCentavos: a.valor_centavos } : { tipo: a.tipo, modo: "percentual" as const, percentualBp: a.percentual_bp })),
      beneficios: p.beneficios.map((b) => ({ tipo: b.tipo, valorCentavos: b.valor_centavos })),
      uniformeEpiCentavos: p.uniforme_epi_centavos,
      insumosCentavos: p.insumos_centavos,
      operacaoCentavos: p.operacao_centavos,
      efetivos: p.efetivos,
      coberturaBpOverride: p.cobertura_bp_override ?? null,
    })),
  };
}

// ── Snapshot da revisão ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cada revisão grava TUDO o que o PDF usa: os parâmetros vigentes na emissão (com o ISS efetivo) e o cálculo linha a linha de cada posto.
// Reabrir o PDF de uma revisão antiga nunca recalcula.
export interface ParametrosTsVigentes extends ParametrosTs {
  vigente_desde: string;
  id?: string | null;
}
export const parametrosTsVigentesSchema = z.object({
  vigente_desde: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  id: z.string().nullable().optional(),
  ...Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, z.number().int().min(0).max(BP_MAXIMO)])),
}) as unknown as z.ZodType<ParametrosTsVigentes>;

const dataIso = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
const linhaSnapshotSchema = z.object({ chave: z.string(), rotulo: z.string(), valor_centavos: z.number().int(), percentual_bp: z.number().int().nullable(), subtotal: z.boolean() });
const postoSnapshotSchema = z.object({
  funcao: z.string(),
  escala: z.string(),
  escala_texto: z.string().nullable(),
  horas_mensais: z.number().int(),
  efetivos: z.number().int().min(1),
  salario_centavos: z.number().int(),
  linhas: z.array(linhaSnapshotSchema),
  remuneracao_centavos: z.number().int(),
  encargos_centavos: z.number().int(),
  beneficios_centavos: z.number().int(),
  insumos_centavos: z.number().int(),
  operacao_centavos: z.number().int(),
  cobertura_bp: z.number().int(),
  custo_unit_centavos: z.number().int(),
  custo_posto_centavos: z.number().int(),
  preco_unit_centavos: z.number().int(),
  preco_posto_centavos: z.number().int(),
});
const servicoSnapshotSchema = z.object({
  nome: z.string(),
  descricao: z.string().nullable(),
  modo: z.enum(["postos", "fechado"]),
  fornecimento: z.object({ equipamentos: z.enum(["salmazos", "cliente"]), produtos: z.enum(["salmazos", "cliente"]) }),
  postos: z.array(postoSnapshotSchema),
  fechado: z.object({ descricao: z.string(), custo_centavos: z.number().int() }).nullable(),
  custo_centavos: z.number().int(),
  preco_calculado_centavos: z.number().int(),
  preco_manual_centavos: z.number().int().nullable(),
  justificativa_preco_manual: z.string().nullable(),
  preco_centavos: z.number().int(),
  margem_real_bp: z.number().int(),
  abaixo_margem_minima: z.boolean(),
});

export const liberacaoMargemTsSchema = z.object({
  justificativa: z.string(),
  servicos: z.array(z.number().int()),
  liberado_por_id: z.string(),
  liberado_por_nome: z.string(),
  liberado_em: z.string(),
});
export type LiberacaoMargemTs = z.infer<typeof liberacaoMargemTsSchema>;

export const snapshotTsSchema = z.object({
  modelo: z.literal("TS"),
  numero: z.string(),
  revisao: z.number().int().min(0),
  template_versao: z.number().int().positive(),
  data_emissao: dataIso,
  cliente_nome: z.string(),
  aos_cuidados: z.string().nullable(),
  texto_introdutorio: z.string(),
  servicos: z.array(servicoSnapshotSchema).min(1),
  parametros: parametrosTsVigentesSchema,
  iss_override_bp: z.number().int().nullable(),
  // Gestor que liberou uma margem abaixo do mínimo (justificativa, serviços e quem liberou); null quando a margem está dentro do mínimo.
  liberacao_margem: liberacaoMargemTsSchema.nullable(),
  condicoes: z.object({ vencimentos_dias: z.array(z.number().int()), antecedencia_dias: z.number().int() }),
  clausulas_adicionais: z.array(z.string()),
  custo_total_centavos: z.number().int(),
  // Valor da proposta (e do Funil): soma dos preços dos serviços.
  total_mensal_centavos: z.number().int(),
  total_mensal_extenso: z.string(),
  validade_dias: z.number().int(),
  validade_ate: dataIso,
  vendedor_nome: z.string(),
  vendedor_cargo: z.string().nullable(),
  vendedor_telefone: z.string().nullable(),
  vendedor_email: z.string().nullable().optional(),
});
export type SnapshotTs = z.infer<typeof snapshotTsSchema>;

export interface EntradaSnapshotTs {
  numero: string;
  revisao: number;
  templateVersao: number;
  dataEmissao: string;
  validadeDias: number;
  validadeAte: string;
  clienteNome: string;
  aosCuidados: string | null;
  conteudo: unknown;
  vendedorNome: string;
  vendedorCargo?: string | null;
  vendedorTelefone: string | null;
  vendedorEmail?: string | null;
  parametros: ParametrosTsVigentes;
  liberacaoMargem?: LiberacaoMargemTs | null;
}

// Rótulo livre de adicional/benefício "outro": só troca o texto da linha (chaves adicional_N / beneficio_N do cálculo); valores e arredondamento não mudam.
function rotuloDaLinhaTs(l: LinhaTs, p: { adicionais: { tipo: string; rotulo?: string }[]; beneficios: { tipo: string; rotulo?: string }[] }): string {
  const m = /^(adicional|beneficio)_([0-9]+)$/.exec(l.chave);
  if (!m) return l.rotulo;
  const item = (m[1] === "adicional" ? p.adicionais : p.beneficios)[Number(m[2]) - 1];
  return item?.tipo === "outro" && item.rotulo ? item.rotulo : l.rotulo;
}
const linhaParaSnapshot = (l: LinhaTs) => ({ chave: l.chave, rotulo: l.rotulo, valor_centavos: l.valorCentavos, percentual_bp: l.percentualBp, subtotal: l.subtotal });

export function montarSnapshotTs(e: EntradaSnapshotTs): SnapshotTs {
  const conteudo = conteudoTsSchema.parse(e.conteudo ?? {});
  const { vigente_desde, id, ...percentuais } = e.parametros;
  if (!parametrosTsValidos(percentuais)) throw new Error("Percentuais do TS inválidos.");
  const base: ParametrosTs = Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, percentuais[k]])) as unknown as ParametrosTs;
  const calc = calcularPropostaTs({ servicos: conteudo.servicos.map(servicoParaCalculo), parametros: base, issOverrideBp: conteudo.iss_override_bp ?? null });
  const introducao = conteudo.texto_introdutorio?.trim();
  return {
    modelo: "TS",
    numero: e.numero,
    revisao: e.revisao,
    template_versao: e.templateVersao,
    data_emissao: e.dataEmissao,
    cliente_nome: e.clienteNome,
    aos_cuidados: e.aosCuidados?.trim() || null,
    texto_introdutorio: introducao && textoDesenhavel(introducao) !== "" ? introducao : TEXTO_INTRODUTORIO_PADRAO_TS,
    servicos: conteudo.servicos.map((s, i) => {
      const c = calc.servicos[i];
      return {
        nome: s.nome,
        descricao: s.descricao?.trim() || null,
        modo: s.modo,
        fornecimento: s.fornecimento,
        postos: s.modo === "postos" ? s.postos.map((p, k) => {
          const pc = c.postos[k];
          return {
            funcao: p.funcao,
            escala: p.escala,
            escala_texto: p.escala_texto?.trim() || null,
            horas_mensais: p.horas_mensais,
            efetivos: p.efetivos,
            salario_centavos: p.salario_centavos,
            linhas: pc.linhas.map((l) => ({ ...linhaParaSnapshot(l), rotulo: rotuloDaLinhaTs(l, p) })),
            remuneracao_centavos: pc.remuneracaoCentavos,
            encargos_centavos: pc.encargosCentavos,
            beneficios_centavos: pc.beneficiosCentavos,
            insumos_centavos: pc.insumosCentavos,
            operacao_centavos: pc.operacaoCentavos,
            cobertura_bp: pc.coberturaBp,
            custo_unit_centavos: pc.custoUnitCentavos,
            custo_posto_centavos: pc.custoPostoCentavos,
            preco_unit_centavos: pc.precoUnitCentavos,
            preco_posto_centavos: pc.precoPostoCentavos,
          };
        }) : [],
        fechado: s.modo === "fechado" ? s.fechado : null,
        custo_centavos: c.custoCentavos,
        preco_calculado_centavos: c.precoCalculadoCentavos,
        preco_manual_centavos: c.precoManualCentavos,
        justificativa_preco_manual: s.justificativa_preco_manual?.trim() || null,
        preco_centavos: c.precoCentavos,
        margem_real_bp: c.margemRealBp,
        abaixo_margem_minima: c.abaixoMargemMinima,
      };
    }),
    parametros: { vigente_desde, id: id ?? null, ...calc.parametros },
    iss_override_bp: conteudo.iss_override_bp ?? null,
    liberacao_margem: e.liberacaoMargem ?? null,
    condicoes: { vencimentos_dias: [...conteudo.condicoes.vencimentos_dias].sort((a, b) => a - b), antecedencia_dias: conteudo.condicoes.antecedencia_dias },
    clausulas_adicionais: conteudo.clausulas_adicionais,
    custo_total_centavos: calc.custoTotalCentavos,
    total_mensal_centavos: calc.totalMensalCentavos,
    total_mensal_extenso: valorPorExtensoBRL(calc.totalMensalCentavos),
    validade_dias: e.validadeDias,
    validade_ate: e.validadeAte,
    vendedor_nome: e.vendedorNome,
    vendedor_cargo: conteudo.cargo_supervisao?.trim() || e.vendedorCargo?.trim() || null,
    vendedor_telefone: e.vendedorTelefone?.trim() || null,
    vendedor_email: emailParaAssinatura(e.vendedorEmail),
  };
}

// ── Regras do servidor (puras, testáveis sem banco) ─────────────────────────────────────────────────────────────────────────────

// O PDF da Terceirização chega na etapa 2E. Enquanto for false, marcar como enviada é BLOQUEADO para o TS (nada é gravado). A rota e o cálculo da
// revisão já estão prontos (a mesma integração do MOT): na 2E basta virar esta constante para true.
export const PDF_TS_DISPONIVEL = false;
export const MSG_PDF_TS_INDISPONIVEL = "PDF da Terceirização ainda não disponível";
export const MSG_SO_DIRETORIA_PRECO_MANUAL = "Só a diretoria pode informar o preço manual.";
export const MSG_SO_DIRETORIA_ISS = "Só a diretoria pode alterar o ISS da proposta.";
export const MSG_SO_DIRETORIA_COBERTURA = "Só a diretoria pode alterar a cobertura de ausências do posto.";
export const MSG_PERCENTUAIS_TS_AUSENTES = "Não há percentuais da Terceirização vigentes para esta data. Peça à diretoria para cadastrá-los.";

const ROTULO_CAMPO_POSTO: Record<string, string> = {
  funcao: "função", escala: "escala", escala_texto: "descrição da escala", horas_mensais: "horas mensais", efetivos: "efetivos", salario_centavos: "salário",
  adicionais: "adicionais", beneficios: "benefícios", uniforme_epi_centavos: "uniforme/EPI", insumos_centavos: "insumos", operacao_centavos: "operação",
  cobertura_bp_override: "cobertura",
};

// Mensagem legível, sem caminho interno: "Serviço 1 · Posto 2 (salário): O salário precisa ser maior que zero."
export function mensagemErroConteudoTs(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((i) => {
      const [raiz, si, c1, pi, campo] = i.path;
      if (raiz === "servicos" && typeof si === "number") {
        const servico = `Serviço ${si + 1}`;
        if (c1 === "postos" && typeof pi === "number") return `${servico} · Posto ${pi + 1}${typeof campo === "string" ? ` (${ROTULO_CAMPO_POSTO[campo] ?? campo})` : ""}: ${i.message}`;
        return `${servico}: ${i.message}`;
      }
      if (raiz === "servicos") return i.message;
      if (raiz === "condicoes") return `Condições: ${i.message}`;
      if (raiz === "clausulas_adicionais" && typeof si === "number") return `Cláusula adicional ${si + 1}: ${i.message}`;
      return i.message;
    })
    .join("; ");
}

// Preço manual e ISS por proposta: SÓ a diretoria. Quem não é gestor não pode informar nem mudar nenhum dos dois (comparado com o que já estava gravado, para
// poder editar uma proposta que a diretoria já tinha ajustado sem mexer nesses campos). Devolve a mensagem da recusa (HTTP 403) ou null.
export function privilegiosTsViolados(novo: ConteudoTs, anterior: ConteudoTs | null, gestor: boolean): string | null {
  if (gestor) return null;
  const manuais = (c: ConteudoTs | null) => (c ? c.servicos.map((x) => x.preco_manual_centavos ?? null) : []);
  const n = manuais(novo), a = manuais(anterior);
  for (let i = 0; i < Math.max(n.length, a.length); i++) if ((n[i] ?? null) !== (a[i] ?? null)) return MSG_SO_DIRETORIA_PRECO_MANUAL;
  if ((novo.iss_override_bp ?? null) !== (anterior?.iss_override_bp ?? null)) return MSG_SO_DIRETORIA_ISS;
  // A cobertura de ausências por posto também é percentual de preço: só a diretoria muda.
  const coberturas = (c: ConteudoTs | null) => (c ? c.servicos.map((x) => (x.modo === "postos" ? x.postos.map((p) => p.cobertura_bp_override ?? null) : [])) : []);
  const cn = coberturas(novo), ca = coberturas(anterior);
  for (let i = 0; i < Math.max(cn.length, ca.length); i++) {
    const a1 = cn[i] ?? [], a2 = ca[i] ?? [];
    for (let j = 0; j < Math.max(a1.length, a2.length); j++) if ((a1[j] ?? null) !== (a2[j] ?? null)) return MSG_SO_DIRETORIA_COBERTURA;
  }
  return null;
}

// ── PERCENTUAIS DE PREÇO NUNCA SAEM PARA QUEM NÃO É GESTOR OU DIRETORIA (em nenhuma rota) ─────────────────────────────────────────────────────────
// "Gestor" aqui é o perfil gestor/diretoria do módulo de Propostas (diretoria e superuser). Percentuais de preço (ISS, PIS, COFINS, IRPJ, CSLL, despesas, lucro, margem
// mínima e cobertura) e tudo o que os revela (margem real, "abaixo da margem", justificativa da liberação) são filtrados NO SERVIDOR antes de qualquer resposta; a
// tela nunca recebe o que não pode mostrar. O vendedor recebe só o valor mensal e os custos por posto, sem percentuais.
const CAMPOS_OCULTOS_CONTEUDO = ["iss_override_bp", "justificativa_margem_minima"] as const;

// Conteúdo da proposta como o vendedor pode ver: sem o ISS por proposta, sem a justificativa de margem e sem a cobertura de cada posto. Trabalha sobre o JSON bruto
// (a linha pode vir de qualquer gravação) e nunca altera o original.
export function conteudoTsParaPerfil<T>(conteudo: T, gestor: boolean): T {
  if (gestor || !conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)) return conteudo;
  const c = { ...(conteudo as Record<string, unknown>) };
  for (const k of CAMPOS_OCULTOS_CONTEUDO) delete c[k];
  if (Array.isArray(c.servicos)) {
    c.servicos = c.servicos.map((x) => {
      if (!x || typeof x !== "object") return x;
      const servico = { ...(x as Record<string, unknown>) };
      if (Array.isArray(servico.postos)) {
        servico.postos = servico.postos.map((p) => {
          if (!p || typeof p !== "object") return p;
          const posto = { ...(p as Record<string, unknown>) };
          delete posto.cobertura_bp_override;
          return posto;
        });
      }
      return servico;
    });
  }
  return c as T;
}

// A linha da proposta (qualquer resposta: criar, editar, detalhe, situação) filtrada para o perfil. Só mexe em proposta TS de quem não é gestor.
export function propostaTsParaPerfil<T extends { modelo?: unknown; conteudo?: unknown }>(proposta: T, gestor: boolean): T {
  if (gestor || !proposta || proposta.modelo !== "TS") return proposta;
  return { ...proposta, conteudo: conteudoTsParaPerfil(proposta.conteudo, false) };
}

// Quem não é gestor NÃO VÊ os campos ocultos, então o que ele devolve ao salvar não os traz: eles voltam do que já estava gravado (senão a edição do vendedor apagaria,
// sem ele saber, o ISS, a cobertura e a justificativa que a diretoria definiu). Só restaura o que veio AUSENTE (undefined); um valor informado de propósito não é
// restaurado e cai na recusa de privilégio (403).
export function restaurarOcultosTs(novo: ConteudoTs, anterior: ConteudoTs | null): ConteudoTs {
  if (!anterior) return novo;
  const c: ConteudoTs = { ...novo };
  if (c.iss_override_bp === undefined && anterior.iss_override_bp !== undefined) c.iss_override_bp = anterior.iss_override_bp;
  if (c.justificativa_margem_minima === undefined && anterior.justificativa_margem_minima !== undefined) c.justificativa_margem_minima = anterior.justificativa_margem_minima;
  c.servicos = novo.servicos.map((s, i) => {
    const antes = anterior.servicos[i];
    if (s.modo !== "postos" || !antes || antes.modo !== "postos") return s;
    return { ...s, postos: s.postos.map((p, j) => (p.cobertura_bp_override === undefined && antes.postos[j]?.cobertura_bp_override !== undefined ? { ...p, cobertura_bp_override: antes.postos[j].cobertura_bp_override } : p)) };
  });
  return c;
}

export type AvaliacaoTs =
  | { ok: true; calc: PropostaTsCalculada; abaixoMargem: number[] }
  | { ok: false; status: number; error: string };

// O servidor SEMPRE recalcula a partir dos dados de entrada com os percentuais vigentes (nunca confia em valor vindo do navegador). Percentuais de preço não
// configurados (tributos + despesas + lucro = 0) ou inválidos: 422 com a mensagem da lib, sem calcular preço. abaixoMargem = índices dos serviços cuja margem
// real ficou abaixo da margem mínima.
export function avaliarPrecoTs(conteudo: ConteudoTs, parametros: ParametrosTsVigentes): AvaliacaoTs {
  const { vigente_desde: _v, id: _i, ...percentuais } = parametros;
  if (!parametrosTsValidos(percentuais)) return { ok: false, status: 500, error: "Os percentuais da Terceirização cadastrados estão inválidos. Avise a diretoria." };
  const base = Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, percentuais[k]])) as unknown as ParametrosTs;
  try {
    const calc = calcularPropostaTs({ servicos: conteudo.servicos.map(servicoParaCalculo), parametros: base, issOverrideBp: conteudo.iss_override_bp ?? null });
    return { ok: true, calc, abaixoMargem: calc.servicos.flatMap((x, i) => (x.abaixoMargemMinima ? [i] : [])) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === MSG_PRECO_TS_NAO_CONFIGURADO || msg === MSG_DEDUCOES_TS_INVALIDAS || msg === MSG_VALOR_GRANDE_DEMAIS) return { ok: false, status: 422, error: msg };
    return { ok: false, status: 400, error: "O conteúdo da proposta de Terceirização está incompleto ou inválido. Revise os serviços e tente de novo." };
  }
}

export type AvaliacaoMargemTs =
  | { ok: true; liberacao: { justificativa: string; servicos: number[] } | null }
  | { ok: false; status: number; error: string };

// Margem abaixo do mínimo: BLOQUEIA quem não é gestor; o gestor libera COM justificativa obrigatória (gravada, com quem liberou, no snapshot e na auditoria).
export function avaliarMargemTs(entrada: { abaixoMargem: number[]; nomesServicos: string[]; gestor: boolean; justificativa: string | null | undefined }): AvaliacaoMargemTs {
  if (entrada.abaixoMargem.length === 0) return { ok: true, liberacao: null };
  const lista = entrada.abaixoMargem.map((i) => `Serviço ${i + 1}${entrada.nomesServicos[i] ? ` – ${entrada.nomesServicos[i]}` : ""}`).join(", ");
  if (!entrada.gestor) return { ok: false, status: 422, error: `A margem ficou abaixo do mínimo definido pela diretoria (${lista}). Só a diretoria pode liberar.` };
  const justificativa = textoDesenhavel(entrada.justificativa ?? "");
  if (justificativa === "") return { ok: false, status: 422, error: `A margem ficou abaixo do mínimo definido pela diretoria (${lista}). Informe a justificativa para liberar.` };
  return { ok: true, liberacao: { justificativa, servicos: entrada.abaixoMargem } };
}

// Visão da planilha para a tela (sem percentuais; a margem real em pontos-base só para o gestor). Sai do snapshot (gravado ou montado na hora), nunca de conta no navegador.
export interface PlanilhaTsTela {
  vigente_desde: string;
  servicos: {
    nome: string;
    modo: "postos" | "fechado";
    postos: { funcao: string; efetivos: number; salario_centavos: number; linhas: { chave: string; rotulo: string; valor_centavos: number; subtotal: boolean }[]; custo_unit_centavos: number; custo_posto_centavos: number; preco_unit_centavos: number; preco_posto_centavos: number }[];
    custo_centavos: number;
    preco_calculado_centavos: number;
    preco_manual_centavos: number | null;
    preco_centavos: number;
    // Só para o gestor/diretoria: o vendedor não recebe nada que revele a margem.
    abaixo_margem_minima?: boolean;
    margem_real_bp?: number;
  }[];
  custo_total_centavos: number;
  total_mensal_centavos: number;
  total_mensal_extenso: string;
  liberacao_margem: LiberacaoMargemTs | null;
}

export function planilhaTsDeSnapshot(snap: SnapshotTs, gestor: boolean): PlanilhaTsTela {
  return {
    vigente_desde: snap.parametros.vigente_desde,
    servicos: snap.servicos.map((x) => ({
      nome: x.nome,
      modo: x.modo,
      postos: x.postos.map((p) => ({
        funcao: p.funcao, efetivos: p.efetivos, salario_centavos: p.salario_centavos,
        linhas: p.linhas.map((l) => ({ chave: l.chave, rotulo: l.rotulo, valor_centavos: l.valor_centavos, subtotal: l.subtotal })),
        custo_unit_centavos: p.custo_unit_centavos, custo_posto_centavos: p.custo_posto_centavos, preco_unit_centavos: p.preco_unit_centavos, preco_posto_centavos: p.preco_posto_centavos,
      })),
      custo_centavos: x.custo_centavos,
      preco_calculado_centavos: x.preco_calculado_centavos,
      preco_manual_centavos: x.preco_manual_centavos,
      preco_centavos: x.preco_centavos,
      ...(gestor ? { abaixo_margem_minima: x.abaixo_margem_minima, margem_real_bp: x.margem_real_bp } : {}),
    })),
    custo_total_centavos: snap.custo_total_centavos,
    total_mensal_centavos: snap.total_mensal_centavos,
    total_mensal_extenso: snap.total_mensal_extenso,
    liberacao_margem: gestor ? snap.liberacao_margem : null,
  };
}

// ── Percentuais (diretoria) ────────────────────────────────────────────────────────────────────────────────────────────────────
export const ROTULO_PARAMETRO_TS: Record<keyof ParametrosTs, string> = {
  fgts_bp: "FGTS", inss_bp: "INSS", multa_fgts_bp: "Multa do FGTS", cobertura_bp: "Cobertura de ausências", iss_bp: "ISS", pis_bp: "PIS", cofins_bp: "COFINS",
  irpj_bp: "IRPJ", csll_bp: "CSLL", despesas_bp: "Despesas", lucro_bp: "Lucro", margem_minima_bp: "Margem mínima",
};

function dataValida(texto: string): boolean {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(texto);
  if (!m) return false;
  const d = new Date(`${texto}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}
const campoPercentualTs = (k: keyof ParametrosTs) =>
  z.number({ error: `Informe ${ROTULO_PARAMETRO_TS[k]} em pontos-base (ex.: 2300 para 23%).` })
    .int(`${ROTULO_PARAMETRO_TS[k]} deve ser um número inteiro de pontos-base (ex.: 2300 para 23%).`)
    .min(0, `${ROTULO_PARAMETRO_TS[k]} não pode ser negativo.`)
    .max(BP_MAXIMO, `${ROTULO_PARAMETRO_TS[k]} passa do limite de ${BP_MAXIMO} pontos-base (100%).`);

// Nova vigência (insert-only). A regra "não retroativa" (vigente_desde >= hoje) é conferida pela rota, que conhece a data de hoje. Além de cada percentual de 0 a
// 10000, tributos + despesas + lucro (D) precisa ficar abaixo de 100%: do contrário o preço (custo ÷ (1 − D)) não existe.
export const parametrosTsCreateSchema = z
  .object({
    vigente_desde: z.string({ error: "Informe a data de início da vigência." }).refine(dataValida, "Informe a data de início da vigência no formato AAAA-MM-DD."),
    ...(Object.fromEntries(CHAVES_PARAMETROS_TS.map((k) => [k, campoPercentualTs(k)])) as { [K in keyof ParametrosTs]: ReturnType<typeof campoPercentualTs> }),
  })
  .refine((d) => deducoesPrecoTs(d).totalBp < BP_MAXIMO, { message: MSG_DEDUCOES_TS_INVALIDAS, path: ["lucro_bp"] });
export type ParametrosTsCreate = z.infer<typeof parametrosTsCreateSchema>;
