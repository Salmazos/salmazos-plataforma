// Modelos de proposta: schemas Zod, padrões configuráveis, texto fixo e snapshot do documento.
// Percentuais e prazos nunca ficam fixos no texto: vêm de `condicoes` (padrão editável por proposta).
import { z } from "zod";
import { emailParaAssinatura, modeloDisponivel, type ContextoModelo, type ModeloProposta } from "@/lib/propostas";
import { textoDesenhavel } from "@/lib/propostaTexto";
import { MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL, clausulaAdicional } from "@/lib/propostaClausulas";
import { TEMPLATE_VERSAO_MOT, conteudoMotSchema, mensagemErroConteudoMot, montarSnapshotMot, type ConteudoMot, type ParametrosMotVigentes, type SnapshotMot } from "@/lib/propostaMot";
import { TEMPLATE_VERSAO_TS, conteudoTsSchema, mensagemErroConteudoTs, montarSnapshotTs, type ConteudoTs, type LiberacaoGanhoTs, type ParametrosTsVigentes, type SnapshotTs } from "@/lib/propostaTs";

// v2: texto introdutório editável, frase de efeito, cláusulas adicionais, marca d'água, logo maior e mais respiro antes da assinatura.
// Revisões já emitidas guardam a versão que usaram e o PDF delas continua saindo no layout dessa versão (ver propostaPdf).
export const TEMPLATE_VERSAO_ATUAL = 2;
export const TEMPLATE_VERSAO_COM_INTRODUCAO = 2;

export const MAX_TEXTO_INTRODUTORIO = 1000;
// Limites e schema das cláusulas adicionais: definição única em propostaClausulas.ts (compartilhada com o MOT); reexportados aqui para quem já importa daqui.
export { MAX_CLAUSULAS_ADICIONAIS, MAX_CLAUSULA_ADICIONAL };

// Campo apagado de propósito ("", só espaços, null) é erro: z.coerce.number() o transformaria em 0 e o PDF do cliente
// sairia com "Taxa de 0%". Só `undefined` (campo ausente) usa o padrão.
function numeroInformado(msgVazio: string, valorSeVazio?: number) {
  return z.unknown().transform((v, ctx) => {
    if (v === null || (typeof v === "string" && v.trim() === "")) {
      if (valorSeVazio !== undefined) return valorSeVazio;
      ctx.addIssue({ code: "custom", message: msgVazio });
      return z.NEVER;
    }
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Informe um número válido." });
      return z.NEVER;
    }
    return n;
  });
}
const pct = (padrao: number) =>
  numeroInformado("Informe o percentual.").pipe(z.number().gt(0, "Use um percentual maior que 0 e até 100.").max(100, "Use um percentual maior que 0 e até 100.")).default(padrao);
// Duas taxas podem ficar sem cobrança: cancelamento/congelamento e "com reposição". Em branco ou 0 vira 0 (guardado como número)
// e o trecho/cláusula sai do PDF (ver itensRs). Os demais percentuais (inclusive a taxa sem reposição) seguem recusando vazio e 0.
// O padrão só vale para campo AUSENTE (proposta/link novo); dado já gravado traz o valor e não muda.
const pctOpcional = (padrao: number, mensagem: string) =>
  numeroInformado("", 0).pipe(z.number().min(0, mensagem).max(100, mensagem)).default(padrao);
const MSG_TAXA_CANCELAMENTO = "Use um percentual de 0 a 100. Deixe em branco ou 0 para não cobrar.";
const pctCancelamento = (padrao: number) => pctOpcional(padrao, MSG_TAXA_CANCELAMENTO);
const MSG_TAXA_REPOSICAO = "Use um percentual de 0 a 100. Deixe em branco ou 0 se não oferecer reposição.";
const pctReposicao = (padrao: number) => pctOpcional(padrao, MSG_TAXA_REPOSICAO);
const diasPositivos = (padrao: number) =>
  numeroInformado("Informe o prazo em dias.").pipe(z.number().int("Use um número inteiro.").positive("Use um número maior que zero.").max(365, "Use no máximo 365 dias.")).default(padrao);

export const condicoesRsSchema = z.object({
  taxa_sem_reposicao_pct: pct(45),
  taxa_com_reposicao_pct: pctReposicao(55),
  prazo_envio_curriculos_dias_uteis: diasPositivos(8),
  taxa_cancelamento_pct: pctCancelamento(25),
  prazo_faturamento_dias: diasPositivos(14),
});
export type CondicoesRs = z.infer<typeof condicoesRsSchema>;

const textoOpcional = (max: number) => z.string().trim().max(max).optional().nullable();

// Texto livre do vendedor: precisa sobrar algo desenhável depois da sanitização (só emoji, por exemplo, não vale).
const textoIntroducao = z
  .string()
  .trim()
  .max(MAX_TEXTO_INTRODUTORIO, `O texto introdutório vai até ${MAX_TEXTO_INTRODUTORIO} caracteres.`)
  .refine((t) => t === "" || textoDesenhavel(t) !== "", "O texto introdutório só tem caracteres que o PDF não consegue imprimir.")
  .optional()
  .nullable();

// O que fica em propostas.conteudo (jsonb) no modelo R&S. CNPJ e endereço do cliente não têm coluna própria.
export const conteudoRsSchema = z.object({
  cliente_cnpj: textoOpcional(30),
  cliente_endereco: textoOpcional(300),
  condicoes: condicoesRsSchema.prefault({}),
  texto_introdutorio: textoIntroducao,
  clausulas_adicionais: z.array(clausulaAdicional).max(MAX_CLAUSULAS_ADICIONAIS, `Use no máximo ${MAX_CLAUSULAS_ADICIONAIS} cláusulas adicionais.`).default([]),
});
export type ConteudoRs = z.infer<typeof conteudoRsSchema>;

export const PADROES_RS: CondicoesRs = condicoesRsSchema.parse({});

export const MODELOS_PROPOSTA: Record<ModeloProposta, { ativo: boolean; templateVersao: number }> = {
  RS: { ativo: true, templateVersao: TEMPLATE_VERSAO_ATUAL },
  // O MOT tem a PRÓPRIA versão de template (começa em 1), independente da do R&S.
  MOT: { ativo: false, templateVersao: TEMPLATE_VERSAO_MOT },
  // O TS também tem a PRÓPRIA versão de template (começa em 1).
  TS: { ativo: false, templateVersao: TEMPLATE_VERSAO_TS },
};

export const MENSAGEM_MODELO_INDISPONIVEL = "Modelo ainda não disponível.";

// Conteúdo validado de qualquer modelo disponível (R&S, MOT ou TS).
export type ConteudoProposta = ConteudoRs | ConteudoMot | ConteudoTs;

// Despacha por modelo. R&S: exatamente como antes (mesmo schema, mesmas mensagens). MOT e TS: conteudoMotSchema / conteudoTsSchema (só quando o modelo está disponível).
export function validarConteudo(modelo: string, bruto: unknown, ctx?: ContextoModelo):
  | { ok: true; data: ConteudoProposta }
  | { ok: false; error: string } {
  if (!modeloDisponivel(modelo, ctx)) return { ok: false, error: MENSAGEM_MODELO_INDISPONIVEL };
  if (modelo === "MOT") {
    const m = conteudoMotSchema.safeParse(bruto ?? {});
    if (!m.success) return { ok: false, error: mensagemErroConteudoMot(m.error.issues) };
    return { ok: true, data: m.data };
  }
  if (modelo === "TS") {
    const t = conteudoTsSchema.safeParse(bruto ?? {});
    if (!t.success) return { ok: false, error: mensagemErroConteudoTs(t.error.issues) };
    return { ok: true, data: t.data };
  }
  const r = conteudoRsSchema.safeParse(bruto ?? {});
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, data: r.data };
}

// ── Texto fixo do modelo R&S (template_versao 1) ────────────────────────────

export const TITULO_RS = "PROPOSTA COMERCIAL: RECRUTAMENTO & SELEÇÃO";
export const TEXTO_INTRODUTORIO_PADRAO_RS = [
  "Prezados,",
  "Agradecemos a oportunidade de apresentar a proposta da Salmazos RH para o recrutamento e seleção de profissionais da sua empresa. Há mais de uma década buscamos, para cada vaga, candidatos alinhados ao perfil e à cultura da sua equipe, com agilidade e transparência em todas as etapas.",
  "Seguem as condições do nosso serviço. Ficamos à disposição para qualquer esclarecimento.",
].join("\n");
// Fixa no template (não editável): entra entre o texto introdutório e a cláusula 1.1 a partir do template v2.
export const FRASE_EFEITO_RS = "Contrate com clareza: acompanhe cada vaga em tempo real pelo portal do cliente Salmazos.";
export const ASSINATURA_RS = "SALMAZOS – Recrutamento, Seleção, Terceirização de Serviços (desde 2013)";

export function formatarPct(valor: number): string {
  return `${String(valor).replace(".", ",")}%`;
}

export interface ItemProposta {
  numero: string;
  texto: string;
}

// Sem taxa de cancelamento (0) a cláusula não existe e as seguintes sobem de número.
export function cobraTaxaCancelamento(taxaCancelamentoPct: number): boolean {
  return taxaCancelamentoPct > 0;
}
// Sem taxa "com reposição" (0) não se oferece reposição: a cláusula 1.1 passa a ter só a taxa única (sem o rótulo "Vagas sem
// reposição", que só faz sentido quando existe a outra faixa) e a numeração das demais não muda.
export function oferecaReposicao(taxaComReposicaoPct: number): boolean {
  return taxaComReposicaoPct > 0;
}
export function quantidadeItensFixosRs(taxaCancelamentoPct: number): number {
  return cobraTaxaCancelamento(taxaCancelamentoPct) ? 7 : 6;
}

export function itensRs(c: CondicoesRs): ItemProposta[] {
  const textos = [
    oferecaReposicao(c.taxa_com_reposicao_pct)
      ? `Taxa de ${formatarPct(c.taxa_sem_reposicao_pct)} sobre 1º salário – Vagas sem reposição; Taxa de ${formatarPct(c.taxa_com_reposicao_pct)} sobre 1º salário – Vagas c/ 01 reposição dentro dos primeiros 30 dias;`
      : `Taxa de ${formatarPct(c.taxa_sem_reposicao_pct)} sobre 1º salário;`,
    `Os currículos serão enviados em até ${c.prazo_envio_curriculos_dias_uteis} dias úteis;`,
    ...(cobraTaxaCancelamento(c.taxa_cancelamento_pct)
      ? [`Caso o processo seletivo tenha sido feito com eficiência, currículos enviados, e o mesmo seja cancelado ou congelado, será cobrada uma taxa de ${formatarPct(c.taxa_cancelamento_pct)} sobre o 1º salário da vaga em questão;`]
      : []),
    `Os candidatos aprovados após exames admissionais serão faturados com Nota Fiscal com até ${c.prazo_faturamento_dias} dias de vencimento;`,
    "A Salmazos RH disponibiliza espaço para entrevistas e dinâmicas de grupo, caso necessário;",
    "Utilizamos para captação as plataformas SALMAZOS, CATHO, LINKEDIN, INDEED, além de outras mídias;",
    "INSTRUMENTOS DE AVALIAÇÃO PSICOLÓGICA (Adicionais, se necessário): AC – Atenção Concentrada; Palográfico – Ritmo/Personalidade; Teste de Estilo de Liderança; PPA | DISC – Comportamental; R-1 – Teste não Verbal de Inteligência; G-38 – Teste não Verbal de Inteligência; Entrevista por Competência.",
  ];
  return textos.map((texto, i) => ({ numero: `1.${i + 1}`, texto }));
}

// Cláusulas livres do vendedor seguem a numeração das fixas: 1.8, 1.9... (com a taxa de cancelamento) ou 1.7, 1.8... (sem ela).
export function itensAdicionais(clausulas: string[], primeiroNumero = 8): ItemProposta[] {
  return clausulas.map((texto, i) => ({ numero: `1.${primeiroNumero + i}`, texto }));
}

// ── Snapshot: tudo o que o PDF usa ──────────────────────────────────────────
// Cada revisão grava este documento inteiro; o PDF de uma revisão sai só dele, nunca de dados vivos.

export const snapshotPropostaSchema = z.object({
  modelo: z.enum(["RS", "MOT", "TS"]),
  numero: z.string(),
  revisao: z.number().int().min(0),
  template_versao: z.number().int().positive(),
  data_emissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cliente_nome: z.string(),
  cliente_cnpj: z.string().nullable(),
  cliente_endereco: z.string().nullable(),
  aos_cuidados: z.string().nullable(),
  condicoes: condicoesRsSchema,
  // Ausentes nos snapshots do template v1 (emitidos antes destes campos existirem).
  texto_introdutorio: z.string().optional(),
  clausulas_adicionais: z.array(z.string()).optional(),
  validade_dias: z.number().int(),
  validade_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendedor_nome: z.string(),
  vendedor_telefone: z.string().nullable(),
  // Ausente em snapshots emitidos antes do campo existir.
  vendedor_email: z.string().nullable().optional(),
});
export type SnapshotProposta = z.infer<typeof snapshotPropostaSchema>;

export interface EntradaSnapshot {
  modelo: ModeloProposta;
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
  vendedorTelefone: string | null;
  vendedorEmail?: string | null;
  // Só o MOT: cargo do vendedor (perfil) e os percentuais vigentes na data da emissão, que o snapshot congela.
  vendedorCargo?: string | null;
  parametrosMot?: ParametrosMotVigentes;
  // Só o TS: os percentuais vigentes na data da emissão (congelados no snapshot) e, se o gestor liberou um ganho abaixo do mínimo, quem liberou e a justificativa.
  parametrosTs?: ParametrosTsVigentes;
  liberacaoGanhoTs?: LiberacaoGanhoTs | null;
}

// Qualquer snapshot de proposta (cada modelo tem o seu formato; o campo "modelo" distingue).
export type SnapshotQualquer = SnapshotProposta | SnapshotMot | SnapshotTs;

// Despacha por modelo: o MOT monta o snapshot com a planilha calculada; o R&S segue o caminho de sempre, sem nenhuma mudança.
export function montarSnapshot(e: EntradaSnapshot & { modelo: "MOT" }): SnapshotMot;
export function montarSnapshot(e: EntradaSnapshot & { modelo: "TS" }): SnapshotTs;
export function montarSnapshot(e: EntradaSnapshot): SnapshotProposta;
export function montarSnapshot(e: EntradaSnapshot): SnapshotQualquer {
  if (e.modelo === "MOT") {
    if (!e.parametrosMot) throw new Error("Percentuais do MOT ausentes: o snapshot do MOT precisa dos parâmetros vigentes.");
    return montarSnapshotMot({
      numero: e.numero, revisao: e.revisao, templateVersao: e.templateVersao, dataEmissao: e.dataEmissao, validadeDias: e.validadeDias, validadeAte: e.validadeAte,
      clienteNome: e.clienteNome, aosCuidados: e.aosCuidados, conteudo: e.conteudo, vendedorNome: e.vendedorNome, vendedorCargo: e.vendedorCargo ?? null,
      vendedorTelefone: e.vendedorTelefone, vendedorEmail: e.vendedorEmail, parametros: e.parametrosMot,
    });
  }
  if (e.modelo === "TS") {
    if (!e.parametrosTs) throw new Error("Percentuais do TS ausentes: o snapshot do TS precisa dos parâmetros vigentes.");
    return montarSnapshotTs({
      numero: e.numero, revisao: e.revisao, templateVersao: e.templateVersao, dataEmissao: e.dataEmissao, validadeDias: e.validadeDias, validadeAte: e.validadeAte,
      clienteNome: e.clienteNome, aosCuidados: e.aosCuidados, conteudo: e.conteudo, vendedorNome: e.vendedorNome, vendedorCargo: e.vendedorCargo ?? null,
      vendedorTelefone: e.vendedorTelefone, vendedorEmail: e.vendedorEmail, parametros: e.parametrosTs, liberacaoGanho: e.liberacaoGanhoTs ?? null,
    });
  }
  const conteudo = conteudoRsSchema.parse(e.conteudo ?? {});
  const introducao = conteudo.texto_introdutorio?.trim();
  return {
    modelo: e.modelo,
    numero: e.numero,
    revisao: e.revisao,
    template_versao: e.templateVersao,
    data_emissao: e.dataEmissao,
    cliente_nome: e.clienteNome,
    cliente_cnpj: conteudo.cliente_cnpj?.trim() || null,
    cliente_endereco: conteudo.cliente_endereco?.trim() || null,
    aos_cuidados: e.aosCuidados?.trim() || null,
    condicoes: conteudo.condicoes,
    // Texto vazio (ou só com o que o PDF não imprime) usa o padrão: o snapshot sempre guarda o texto que saiu no PDF.
    texto_introdutorio: introducao && textoDesenhavel(introducao) !== "" ? introducao : TEXTO_INTRODUTORIO_PADRAO_RS,
    clausulas_adicionais: conteudo.clausulas_adicionais,
    validade_dias: e.validadeDias,
    validade_ate: e.validadeAte,
    vendedor_nome: e.vendedorNome,
    vendedor_telefone: e.vendedorTelefone?.trim() || null,
    vendedor_email: emailParaAssinatura(e.vendedorEmail),
  };
}
