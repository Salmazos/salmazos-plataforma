// Proposta de Terceirização de Serviços (TS): conteúdo editável, validação, constantes e snapshot da revisão.
// Módulo sem imports de servidor: roda no client, no server e no harness. Não importa propostaModelos (que, na 2C, passa a despachar para cá), para não haver ciclo.
import { z } from "zod";
import { textoDesenhavel } from "@/lib/propostaTexto";
import { MAX_CLAUSULAS_ADICIONAIS, clausulaAdicional } from "@/lib/propostaClausulas";
import { emailParaAssinatura } from "@/lib/propostas";
import { condicoesMotSchema } from "@/lib/propostaMot";
import { formatarCentavosBRL, valorPorExtensoBRL } from "@/lib/propostaMotCalculo";
import {
  BP_MAXIMO, CHAVES_PARAMETROS_TS, EFETIVOS_MAXIMO, VALOR_MAXIMO_CENTAVOS, calcularPropostaTs, parametrosTsValidos,
  type LinhaTs, type ParametrosTs, type ServicoTsEntrada,
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

export const adicionalTsSchema = z.discriminatedUnion("modo", [
  z.object({ tipo: z.enum(codigos(TIPOS_ADICIONAL_TS), { error: "Tipo de adicional inválido." }), modo: z.literal("valor"), valor_centavos: centavosPositivos("o valor do adicional") }),
  z.object({ tipo: z.enum(codigos(TIPOS_ADICIONAL_TS), { error: "Tipo de adicional inválido." }), modo: z.literal("percentual"), percentual_bp: percentualBp("o percentual do adicional", 1) }),
], { error: "Adicional inválido." });

export const beneficioTsSchema = z.object({
  tipo: z.enum(codigos(TIPOS_BENEFICIO_TS), { error: "Tipo de benefício inválido." }),
  valor_centavos: centavosPositivos("o valor do benefício"),
});

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
            linhas: pc.linhas.map(linhaParaSnapshot),
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
