// Proposta de Mão de Obra Temporária (MOT): conteúdo editável, validação, texto fixo do modelo e snapshot da revisão.
// Fonte dos campos: Prop Temp Selmi 071.26.docx (modelo que o Ölver usa hoje). Módulo sem imports de servidor: roda no client, no server e no harness.
// Não importa propostaModelos (que despacha para cá), para não haver ciclo.
import { z } from "zod";
import { textoDesenhavel } from "@/lib/propostaTexto";
import { MAX_CLAUSULAS_ADICIONAIS, clausulaAdicional } from "@/lib/propostaClausulas";
import { emailParaAssinatura } from "@/lib/propostas";
import {
  BP_MAXIMO, CHAVES_PARAMETROS_MOT, SALARIO_MAXIMO_CENTAVOS, calcularPlanilhaMot, formatarCentavosBRL, parametrosMotValidos, valorPorExtensoBRL,
  type LinhaPlanilhaMot, type ParametrosMot,
} from "@/lib/propostaMotCalculo";

// Versão do template do MOT, SEPARADA da do R&S (cada modelo evolui sozinho; revisões antigas guardam a versão que usaram).
export const TEMPLATE_VERSAO_MOT = 1;

export const MAX_FUNCOES_MOT = 20;
export const MAX_TEXTO_INTRODUTORIO_MOT = 1000;
const MAX_AREA = 80, MAX_DESCRICAO = 200, MAX_JORNADA = 120, MAX_HORARIO = 120, MAX_CARGO = 100;

// ── Texto fixo do modelo (idêntico ao Word, com os erros de digitação corrigidos: ver relatório) ─────────────────────────────────
export const TITULO_MOT = "PROPOSTA COMERCIAL: MÃO DE OBRA TEMPORÁRIA";
export const SUBTITULO_MOT = "Prestação de serviços de Mão de obra temporária – Lei 6019/74 (contratos de até 270 dias).";
// "seguimento" do Word virou "segmento".
export const TEXTO_INTRODUTORIO_PADRAO_MOT = [
  "Vimos através desta, apresentar nossa Proposta de Mão de Obra Temporária.",
  "Contamos com o apoio de uma equipe qualificada e treinada no segmento de mão de obra e terceirização de serviços, entre eles: Psicólogos, Contador e Advogados, priorizamos a ética e atenção às necessidades de nossos clientes.",
  "As atividades são coordenadas por profissionais qualificados com expertise no segmento da prestação de serviços.",
].join("\n");
export const ASSINATURA_MOT = [
  "SALMAZOS – Recrutamento, Seleção e Terceirização de Serviços (desde 2013)",
  "CNPJ.: 18.545.074/0001-79",
  "Elizabete Salmazo Santos",
  "19 99452-7272",
  "19 3217-7899",
];
// Padrões de uma função nova (o que o Word traz no quadro ORÇAMENTO): usados pela tela, nunca aplicados em silêncio pelo servidor.
export const FUNCAO_MOT_PADRAO = { area: "OPERACIONAL", jornada: "Conforme Convenção Coletiva", horario: "Turnos A / B /C" } as const;
export const COLUNAS_ORCAMENTO_MOT = ["ÁREA", "DESCRIÇÃO / Salário", "JORNADA", "HORÁRIO"] as const;

export interface CondicoesMot {
  vencimentos_dias: number[];
  antecedencia_dias: number;
}

export const ITENS_FIXOS_MOT = {
  // "clinicas" do Word virou "clínicas".
  exames: "Os exames admissionais poderão ser emitidos por nossas clínicas conveniadas, bem como os benefícios e repassados.",
  // "repassadosna" do Word virou "repassados na".
  encargos: "Todos os Encargos Trabalhistas (INSS, FGTS, Férias, 1/3 Férias, 13º Salário), serão devidamente pagos aos colaboradores e repassados na ocasião da rescisão.",
  adicionais:
    "Os valores apresentados na tabela a seguir contemplam a jornada padrão de trabalho. Eventuais adicionais variáveis exigidos pela Convenção Coletiva de Trabalho (CCT) da categoria da Contratante ou pela legislação vigente — tais como horas extras, adicional noturno, insalubridade, periculosidade e reflexos — não estão inclusos no valor base e serão faturados conforme a efetiva ocorrência, seguindo os percentuais e critérios discriminados na tabela de encargos a seguir.",
  faltas: "No caso de faltas, será descontado da fatura e atestados serão repassados à Contratante.",
} as const;

// O PDF numera as cláusulas 1.1 a 1.5 (fixas: exames, encargos, adicionais da CCT, faltas e faturamento) e as adicionais seguem a partir de 1.6.
export const QUANTIDADE_ITENS_FIXOS_MOT = 5;
export const numeroClausulaAdicionalMot = (indice: number): string => `1.${QUANTIDADE_ITENS_FIXOS_MOT + 1 + indice}`;

const doisDigitos = (n: number) => String(n).padStart(2, "0");
// "dia 15 e 30" / "dia 5, 15 e 30"; antecedência com dois dígitos como no Word ("05 dias").
export function textoFaturamentoMot(c: CondicoesMot): string {
  const dias = [...c.vencimentos_dias].sort((a, b) => a - b).map(String);
  const lista = dias.length <= 1 ? dias.join("") : `${dias.slice(0, -1).join(", ")} e ${dias[dias.length - 1]}`;
  const antecedencia = `${doisDigitos(c.antecedencia_dias)} ${c.antecedencia_dias === 1 ? "dia" : "dias"}`;
  return `O faturamento será através de nota fiscal com vencimento da fatura para dia ${lista}, pago à Salmazos RH, com antecedência de ${antecedencia} do pagamento dos colaboradores ou conforme acordado entre as partes.`;
}

// ── Conteúdo editável (propostas.conteudo no modelo MOT) ─────────────────────────────────────────────────────────────────────────
const naoVazio = (rotulo: string, max: number) =>
  z.string({ error: `Preencha ${rotulo}.` }).trim().min(1, `Preencha ${rotulo}.`).max(max, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} vai até ${max} caracteres.`)
    .refine((t) => textoDesenhavel(t) !== "", `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} só tem caracteres que o PDF não consegue imprimir.`);
const opcional = (rotulo: string, max: number) =>
  z.string().trim().max(max, `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} vai até ${max} caracteres.`)
    .refine((t) => t === "" || textoDesenhavel(t) !== "", `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)} só tem caracteres que o PDF não consegue imprimir.`)
    .optional().nullable();

const salarioCentavos = z
  .number({ error: "Informe o salário em reais (maior que zero)." })
  .int("O salário deve ser um valor em centavos inteiros.")
  .min(1, "O salário precisa ser maior que zero.")
  .max(SALARIO_MAXIMO_CENTAVOS, `O salário passa do limite de ${formatarCentavosBRL(SALARIO_MAXIMO_CENTAVOS)}.`);

export const funcaoMotSchema = z.object({
  area: naoVazio("a área", MAX_AREA),
  // "DESCRIÇÃO / Salário": a descrição (cargo/função) é opcional no Word; o salário sempre sai na célula.
  descricao: opcional("a descrição", MAX_DESCRICAO),
  salario_centavos: salarioCentavos,
  jornada: naoVazio("a jornada", MAX_JORNADA),
  horario: naoVazio("o horário", MAX_HORARIO),
});
export type FuncaoMot = z.infer<typeof funcaoMotSchema>;

export const condicoesMotSchema = z.object({
  vencimentos_dias: z
    .array(z.number().int("Use dias inteiros.").min(1, "O dia de vencimento vai de 1 a 31.").max(31, "O dia de vencimento vai de 1 a 31."), { error: "Informe os dias de vencimento." })
    .min(1, "Informe pelo menos um dia de vencimento.")
    .max(4, "Use no máximo 4 dias de vencimento.")
    .refine((d) => new Set(d).size === d.length, "Não repita o mesmo dia de vencimento.")
    .default([15, 30]),
  antecedencia_dias: z.number({ error: "Informe a antecedência em dias." }).int("Use dias inteiros.").min(0, "A antecedência não pode ser negativa.").max(30, "A antecedência vai até 30 dias.").default(5),
});

const textoIntroducao = z
  .string()
  .trim()
  .max(MAX_TEXTO_INTRODUTORIO_MOT, `O texto introdutório vai até ${MAX_TEXTO_INTRODUTORIO_MOT} caracteres.`)
  .refine((t) => t === "" || textoDesenhavel(t) !== "", "O texto introdutório só tem caracteres que o PDF não consegue imprimir.")
  .optional()
  .nullable();

const MSG_CLAUSULAS_TIPO = "As cláusulas adicionais devem ser uma lista de textos.";
export const conteudoMotSchema = z.object({
  texto_introdutorio: textoIntroducao,
  // "Supervisão Técnica: NOME – cargo": o nome é o do vendedor; o cargo sai do perfil dele, a não ser que seja informado aqui.
  cargo_supervisao: opcional("o cargo", MAX_CARGO),
  funcoes: z.array(funcaoMotSchema, { error: "Informe pelo menos uma função." }).min(1, "Informe pelo menos uma função.").max(MAX_FUNCOES_MOT, `Use no máximo ${MAX_FUNCOES_MOT} funções.`)
    // A planilha única é calculada sobre a SOMA dos salários: a soma também respeita o teto da calculadora.
    .refine((l) => l.reduce((s, f) => s + f.salario_centavos, 0) <= SALARIO_MAXIMO_CENTAVOS, `A soma dos salários passa do limite de ${formatarCentavosBRL(SALARIO_MAXIMO_CENTAVOS)}.`),
  condicoes: condicoesMotSchema.prefault({}),
  // Opcionais, no mesmo padrão e com os mesmos limites do R&S (propostaClausulas.ts). Lista vazia por padrão; só saem no PDF quando houver itens.
  clausulas_adicionais: z.array(clausulaAdicional, { error: MSG_CLAUSULAS_TIPO }).max(MAX_CLAUSULAS_ADICIONAIS, `Use no máximo ${MAX_CLAUSULAS_ADICIONAIS} cláusulas adicionais.`).default([]),
});
export type ConteudoMot = z.infer<typeof conteudoMotSchema>;

const ROTULO_CAMPO_FUNCAO: Record<string, string> = { area: "área", descricao: "descrição", salario_centavos: "salário", jornada: "jornada", horario: "horário" };

// Mensagem legível, sem caminho interno: "Função 2 (salário): O salário precisa ser maior que zero."
export function mensagemErroConteudoMot(issues: { path: PropertyKey[]; message: string }[]): string {
  // Tipo errado (ex.: texto no lugar da lista): só essa mensagem, sem as regras de tamanho que não fazem sentido para o que veio.
  if (issues.some((i) => i.message === MSG_CLAUSULAS_TIPO)) return MSG_CLAUSULAS_TIPO;
  return issues
    .map((i) => {
      const [raiz, indice, campo] = i.path;
      if (raiz === "funcoes" && typeof indice === "number") return `Função ${indice + 1}${typeof campo === "string" ? ` (${ROTULO_CAMPO_FUNCAO[campo] ?? campo})` : ""}: ${i.message}`;
      if (raiz === "funcoes") return i.message;
      if (raiz === "condicoes") return `Condições: ${i.message}`;
      if (raiz === "clausulas_adicionais" && typeof indice === "number") return `Cláusula adicional ${indice + 1}: ${i.message}`;
      return i.message;
    })
    .join("; ");
}

// ── Snapshot da revisão ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cada revisão grava TUDO o que o PDF usa: os parâmetros vigentes na data da emissão e a planilha calculada de cada função (centavos inteiros).
// Reabrir o PDF de uma revisão antiga nunca recalcula: mudar os percentuais depois não altera o que já foi enviado.

export interface ParametrosMotVigentes extends ParametrosMot {
  vigente_desde: string;
  id?: string | null;
}

export const parametrosVigentesSchema = z.object({
  vigente_desde: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  id: z.string().nullable().optional(),
  ...Object.fromEntries(CHAVES_PARAMETROS_MOT.map((k) => [k, z.number().int().min(0).max(BP_MAXIMO)])),
}) as unknown as z.ZodType<ParametrosMotVigentes>;

const linhaSnapshotSchema = z.object({ chave: z.string(), rotulo: z.string(), valor_centavos: z.number().int().nullable(), percentual_bp: z.number().int().nullable() });
const planilhaSnapshotSchema = z.object({
  salario_centavos: z.number().int(),
  linhas: z.array(linhaSnapshotSchema),
  base_centavos: z.number().int(),
  subtotal_centavos: z.number().int(),
  retencoes: z.array(linhaSnapshotSchema),
  total_retencoes_centavos: z.number().int(),
  total_nf_centavos: z.number().int(),
});

export const snapshotMotSchema = z.object({
  modelo: z.literal("MOT"),
  numero: z.string(),
  revisao: z.number().int().min(0),
  template_versao: z.number().int().positive(),
  data_emissao: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  cliente_nome: z.string(),
  aos_cuidados: z.string().nullable(),
  texto_introdutorio: z.string(),
  funcoes: z.array(z.object({
    area: z.string(),
    descricao: z.string().nullable(),
    jornada: z.string(),
    horario: z.string(),
    salario_centavos: z.number().int(),
    planilha: planilhaSnapshotSchema,
    // VALOR MENSAL do Word = TOTAL N. FISCAL da função, com o valor por extenso ("Mil, oitocentos e ..."; nunca "Hum mil").
    valor_mensal_centavos: z.number().int(),
    valor_mensal_extenso: z.string(),
  })).min(1),
  // LAYOUT DA PLANILHA (decisão do Ölver): "unica" = UMA planilha de verbas calculada sobre a SOMA dos salários das funções (planilha_unica); o total da
  // proposta é o TOTAL N. FISCAL dela. Ausente = revisões antigas, com uma planilha por função e o total somando as funções: nunca mudam. Nas revisões "unica",
  // planilha/valor_mensal de cada função ficam só como referência da conta individual e NÃO valem como valor da proposta.
  layout_planilha: z.literal("unica").optional(),
  planilha_unica: planilhaSnapshotSchema.optional(),
  parametros: parametrosVigentesSchema,
  condicoes: z.object({ vencimentos_dias: z.array(z.number().int()), antecedencia_dias: z.number().int() }),
  clausulas_adicionais: z.array(z.string()),
  // Valor da proposta (e do Funil): soma dos valores mensais das funções (layout antigo) ou o TOTAL N. FISCAL da planilha única (layout "unica").
  total_mensal_centavos: z.number().int(),
  total_mensal_extenso: z.string(),
  validade_dias: z.number().int(),
  validade_ate: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  vendedor_nome: z.string(),
  vendedor_cargo: z.string().nullable(),
  vendedor_telefone: z.string().nullable(),
  vendedor_email: z.string().nullable().optional(),
});
export type SnapshotMot = z.infer<typeof snapshotMotSchema>;

export interface EntradaSnapshotMot {
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
  parametros: ParametrosMotVigentes;
  // Padrão "unica" (propostas e revisões novas). "por_funcao" só existe para reproduzir o formato antigo nos testes.
  layoutPlanilha?: "unica" | "por_funcao";
}

const linhaParaSnapshot = (l: LinhaPlanilhaMot) => ({ chave: l.chave, rotulo: l.rotulo, valor_centavos: l.valorCentavos, percentual_bp: l.percentualBp });

export function montarSnapshotMot(e: EntradaSnapshotMot): SnapshotMot {
  const conteudo = conteudoMotSchema.parse(e.conteudo ?? {});
  const { vigente_desde, id, ...percentuais } = e.parametros;
  if (!parametrosMotValidos(percentuais)) throw new Error("Percentuais do MOT inválidos.");
  const parametros: ParametrosMot = Object.fromEntries(CHAVES_PARAMETROS_MOT.map((k) => [k, percentuais[k]])) as unknown as ParametrosMot;

  const funcoes = conteudo.funcoes.map((f) => {
    const p = calcularPlanilhaMot({ salarioCentavos: f.salario_centavos, parametros });
    return {
      area: f.area,
      descricao: f.descricao?.trim() || null,
      jornada: f.jornada,
      horario: f.horario,
      salario_centavos: f.salario_centavos,
      planilha: {
        salario_centavos: p.salarioCentavos,
        linhas: p.linhas.map(linhaParaSnapshot),
        base_centavos: p.baseCentavos,
        subtotal_centavos: p.subtotalCentavos,
        retencoes: p.retencoes.map(linhaParaSnapshot),
        total_retencoes_centavos: p.totalRetencoesCentavos,
        total_nf_centavos: p.totalNfCentavos,
      },
      valor_mensal_centavos: p.totalNfCentavos,
      valor_mensal_extenso: valorPorExtensoBRL(p.totalNfCentavos),
    };
  });
  const unica = (e.layoutPlanilha ?? "unica") === "unica";
  const pu = unica ? calcularPlanilhaMot({ salarioCentavos: conteudo.funcoes.reduce((s, f) => s + f.salario_centavos, 0), parametros }) : null;
  const total = pu ? pu.totalNfCentavos : funcoes.reduce((s, f) => s + f.valor_mensal_centavos, 0);
  const introducao = conteudo.texto_introdutorio?.trim();
  return {
    modelo: "MOT",
    numero: e.numero,
    revisao: e.revisao,
    template_versao: e.templateVersao,
    data_emissao: e.dataEmissao,
    cliente_nome: e.clienteNome,
    aos_cuidados: e.aosCuidados?.trim() || null,
    // Texto vazio (ou só com o que o PDF não imprime) usa o padrão: o snapshot sempre guarda o texto que sai no PDF.
    texto_introdutorio: introducao && textoDesenhavel(introducao) !== "" ? introducao : TEXTO_INTRODUTORIO_PADRAO_MOT,
    funcoes,
    ...(pu ? {
      layout_planilha: "unica" as const,
      planilha_unica: {
        salario_centavos: pu.salarioCentavos,
        linhas: pu.linhas.map(linhaParaSnapshot),
        base_centavos: pu.baseCentavos,
        subtotal_centavos: pu.subtotalCentavos,
        retencoes: pu.retencoes.map(linhaParaSnapshot),
        total_retencoes_centavos: pu.totalRetencoesCentavos,
        total_nf_centavos: pu.totalNfCentavos,
      },
    } : {}),
    parametros: { vigente_desde, id: id ?? null, ...parametros },
    condicoes: { vencimentos_dias: [...conteudo.condicoes.vencimentos_dias].sort((a, b) => a - b), antecedencia_dias: conteudo.condicoes.antecedencia_dias },
    clausulas_adicionais: conteudo.clausulas_adicionais,
    total_mensal_centavos: total,
    total_mensal_extenso: valorPorExtensoBRL(total),
    validade_dias: e.validadeDias,
    validade_ate: e.validadeAte,
    vendedor_nome: e.vendedorNome,
    vendedor_cargo: conteudo.cargo_supervisao?.trim() || e.vendedorCargo?.trim() || null,
    vendedor_telefone: e.vendedorTelefone?.trim() || null,
    vendedor_email: emailParaAssinatura(e.vendedorEmail),
  };
}

// ── Parâmetros da planilha (diretoria) ───────────────────────────────────────────────────────────────────────────────────────────

// Faixas "sensatas" por percentual (pontos-base): protegem de um erro de digitação (ex.: 3120 digitado como 31200). Todas ficam acima dos valores
// iniciais e dentro do CHECK 0..10000 da tabela. Ajustar aqui, num lugar só, se a diretoria precisar de mais.
export const LIMITES_PARAMETROS_MOT: Record<keyof ParametrosMot, number> = {
  taxa_administrativa_bp: 5000,
  encargos_tributarios_bp: 6000,
  inss_patronal_bp: 4000,
  fgts_bp: 1000,
  ret_iss_bp: 500,
  ret_inss_bp: 2000,
  ret_ir_bp: 1000,
  ret_cofins_bp: 1000,
  ret_csll_bp: 1000,
  ret_pis_bp: 500,
};
export const ROTULO_PARAMETRO_MOT: Record<keyof ParametrosMot, string> = {
  taxa_administrativa_bp: "Taxa administrativa",
  encargos_tributarios_bp: "Encargos tributários",
  inss_patronal_bp: "INSS patronal",
  fgts_bp: "FGTS",
  ret_iss_bp: "Retenção de ISS",
  ret_inss_bp: "Retenção de INSS",
  ret_ir_bp: "Retenção de IR",
  ret_cofins_bp: "Retenção de COFINS",
  ret_csll_bp: "Retenção de CSLL",
  ret_pis_bp: "Retenção de PIS",
};

const campoPercentual = (k: keyof ParametrosMot) =>
  z.number({ error: `Informe ${ROTULO_PARAMETRO_MOT[k]} em pontos-base (ex.: 3120 para 31,2%).` })
    .int(`${ROTULO_PARAMETRO_MOT[k]} deve ser um número inteiro de pontos-base (ex.: 3120 para 31,2%).`)
    .min(0, `${ROTULO_PARAMETRO_MOT[k]} não pode ser negativo.`)
    .max(LIMITES_PARAMETROS_MOT[k], `${ROTULO_PARAMETRO_MOT[k]} passa do limite de ${LIMITES_PARAMETROS_MOT[k]} pontos-base (${LIMITES_PARAMETROS_MOT[k] / 100}%).`);

function dataValida(s: string): boolean {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Nova vigência (insert-only). A regra "não retroativa" (vigente_desde >= hoje) é conferida pela rota, que conhece a data de hoje.
export const parametrosMotCreateSchema = z.object({
  vigente_desde: z.string({ error: "Informe a data de início da vigência." }).refine(dataValida, "Informe a data de início da vigência no formato AAAA-MM-DD."),
  ...(Object.fromEntries(CHAVES_PARAMETROS_MOT.map((k) => [k, campoPercentual(k)])) as { [K in keyof ParametrosMot]: ReturnType<typeof campoPercentual> }),
});
export type ParametrosMotCreate = z.infer<typeof parametrosMotCreateSchema>;

// Linha informativa da planilha única (PDF e telas): "Base de cálculo: R$ 2.500,00 (Operacional: R$ 1.000,00 + Administrativo: R$ 1.500,00)".
// Com uma função só: o nome e o valor. A base é a soma dos salários (não existe quantidade de pessoas por função).
export function textoBaseCalculoMot(funcoes: { area: string; salario_centavos: number }[], baseCentavos: number): string {
  const base = formatarCentavosBRL(baseCentavos);
  if (funcoes.length === 1) return `Base de cálculo: ${base} (${funcoes[0].area})`;
  return `Base de cálculo: ${base} (${funcoes.map((f) => `${f.area}: ${formatarCentavosBRL(f.salario_centavos)}`).join(" + ")})`;
}

// ── Prévia do cálculo (tela de Nova proposta MOT) ───────────────────────────────────────────────────────────────────────────────
// A tela mostra o cálculo ao vivo SEM gravar nada e SEM receber os percentuais: o servidor calcula com a MESMA montarSnapshotMot da criação (então o que a
// tela mostra é o que a proposta vai gravar) e devolve só os VALORES de cada linha. Percentual cru (fgts_bp etc.) nunca sai daqui.
// Cada posição pode ser null (função ainda sem salário): volta null na mesma posição, para a tela não se perder.
export const previaMotSchema = z.object({
  salarios_centavos: z
    .array(salarioCentavos.nullable(), { error: "Informe os salários das funções." })
    .min(1, "Informe pelo menos uma função.")
    .max(MAX_FUNCOES_MOT, `Use no máximo ${MAX_FUNCOES_MOT} funções.`)
    .refine((l) => l.some((s) => s !== null), "Informe o salário de pelo menos uma função."),
});

export interface LinhaPreviaMot {
  chave: string;
  rotulo: string;
  valor_centavos: number | null;
}
export interface FuncaoPreviaMot {
  salario_centavos: number;
  linhas: LinhaPreviaMot[];
  subtotal_centavos: number;
  retencoes: LinhaPreviaMot[];
  total_retencoes_centavos: number;
  total_nf_centavos: number;
  valor_mensal_extenso: string;
}
export interface PreviaMot {
  vigente_desde: string;
  funcoes: (FuncaoPreviaMot | null)[];
  // Presente só no layout "unica": a planilha única (salario_centavos = a base, soma dos salários). Quando existe, o valor da proposta é o total_nf dela e o
  // total_nf de cada função em `funcoes` NÃO é mostrado como valor.
  unica?: FuncaoPreviaMot | null;
  total_mensal_centavos: number;
  total_mensal_extenso: string;
}

const semPercentual = (l: { chave: string; rotulo: string; valor_centavos: number | null }): LinhaPreviaMot => ({ chave: l.chave, rotulo: l.rotulo, valor_centavos: l.valor_centavos });
const funcaoPrevia = (f: SnapshotMot["funcoes"][number]): FuncaoPreviaMot => ({
  salario_centavos: f.salario_centavos,
  linhas: f.planilha.linhas.map(semPercentual),
  subtotal_centavos: f.planilha.subtotal_centavos,
  retencoes: f.planilha.retencoes.map(semPercentual),
  total_retencoes_centavos: f.planilha.total_retencoes_centavos,
  total_nf_centavos: f.planilha.total_nf_centavos,
  valor_mensal_extenso: f.valor_mensal_extenso,
});

// A mesma visão sem percentuais, a partir do snapshot JÁ GRAVADO de uma revisão (a tela de detalhe nunca recalcula o que foi enviado).
export function previaDeSnapshotMot(snap: SnapshotMot): PreviaMot {
  const pu = snap.layout_planilha === "unica" ? snap.planilha_unica : undefined;
  const unica = pu ? funcaoPrevia({ ...snap.funcoes[0], salario_centavos: pu.salario_centavos, planilha: pu, valor_mensal_centavos: pu.total_nf_centavos, valor_mensal_extenso: snap.total_mensal_extenso }) : undefined;
  return { vigente_desde: snap.parametros.vigente_desde, funcoes: snap.funcoes.map(funcaoPrevia), ...(unica ? { unica } : {}), total_mensal_centavos: snap.total_mensal_centavos, total_mensal_extenso: snap.total_mensal_extenso };
}

export function montarPreviaMot(salarios: (number | null)[], parametros: ParametrosMotVigentes): PreviaMot {
  const posicoes = salarios.flatMap((s, i) => (s === null ? [] : [i]));
  const snap = montarSnapshotMot({
    numero: "PREVIA",
    revisao: 0,
    templateVersao: TEMPLATE_VERSAO_MOT,
    dataEmissao: "2000-01-01",
    validadeDias: 1,
    validadeAte: "2000-01-02",
    clienteNome: "Prévia",
    aosCuidados: null,
    // Só o salário importa para o cálculo; os outros campos são marcadores para passar no mesmo schema da criação.
    conteudo: { funcoes: posicoes.map((i) => ({ ...FUNCAO_MOT_PADRAO, salario_centavos: salarios[i] as number })) },
    vendedorNome: "Prévia",
    vendedorTelefone: null,
    parametros,
  });
  const funcoes: (FuncaoPreviaMot | null)[] = salarios.map(() => null);
  snap.funcoes.forEach((f, k) => { funcoes[posicoes[k]] = funcaoPrevia(f); });
  return { ...previaDeSnapshotMot(snap), funcoes };
}
