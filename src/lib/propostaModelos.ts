// Modelos de proposta: schemas Zod, padrões configuráveis, texto fixo e snapshot do documento.
// Percentuais e prazos nunca ficam fixos no texto: vêm de `condicoes` (padrão editável por proposta).
import { z } from "zod";
import { MODELOS_ATIVOS, type ModeloProposta } from "@/lib/propostas";

export const TEMPLATE_VERSAO_ATUAL = 1;

// Campo apagado de propósito ("", só espaços, null) é erro: z.coerce.number() o transformaria em 0 e o PDF do cliente
// sairia com "Taxa de 0%". Só `undefined` (campo ausente) usa o padrão.
function numeroInformado(msgVazio: string) {
  return z.unknown().transform((v, ctx) => {
    if (v === null || (typeof v === "string" && v.trim() === "")) {
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
const diasPositivos = (padrao: number) =>
  numeroInformado("Informe o prazo em dias.").pipe(z.number().int("Use um número inteiro.").positive("Use um número maior que zero.").max(365, "Use no máximo 365 dias.")).default(padrao);

export const condicoesRsSchema = z.object({
  taxa_sem_reposicao_pct: pct(45),
  taxa_com_reposicao_pct: pct(55),
  prazo_envio_curriculos_dias_uteis: diasPositivos(8),
  taxa_cancelamento_pct: pct(25),
  prazo_faturamento_dias: diasPositivos(14),
});
export type CondicoesRs = z.infer<typeof condicoesRsSchema>;

const textoOpcional = (max: number) => z.string().trim().max(max).optional().nullable();

// O que fica em propostas.conteudo (jsonb) no modelo R&S. CNPJ e endereço do cliente não têm coluna própria.
export const conteudoRsSchema = z.object({
  cliente_cnpj: textoOpcional(30),
  cliente_endereco: textoOpcional(300),
  condicoes: condicoesRsSchema.prefault({}),
});
export type ConteudoRs = z.infer<typeof conteudoRsSchema>;

export const PADROES_RS: CondicoesRs = condicoesRsSchema.parse({});

export const MODELOS_PROPOSTA: Record<ModeloProposta, { ativo: boolean; templateVersao: number }> = {
  RS: { ativo: true, templateVersao: TEMPLATE_VERSAO_ATUAL },
  MOT: { ativo: false, templateVersao: TEMPLATE_VERSAO_ATUAL },
  TS: { ativo: false, templateVersao: TEMPLATE_VERSAO_ATUAL },
};

export const MENSAGEM_MODELO_INDISPONIVEL = "Modelo ainda não disponível.";

export function validarConteudo(modelo: string, bruto: unknown):
  | { ok: true; data: ConteudoRs }
  | { ok: false; error: string } {
  if (!(MODELOS_ATIVOS as string[]).includes(modelo)) return { ok: false, error: MENSAGEM_MODELO_INDISPONIVEL };
  const r = conteudoRsSchema.safeParse(bruto ?? {});
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, data: r.data };
}

// ── Texto fixo do modelo R&S (template_versao 1) ────────────────────────────

export const TITULO_RS = "PROPOSTA COMERCIAL: RECRUTAMENTO & SELEÇÃO";
export const ASSINATURA_RS = "SALMAZOS – Recrutamento, Seleção, Terceirização de Serviços (desde 2013)";

export function formatarPct(valor: number): string {
  return `${String(valor).replace(".", ",")}%`;
}

export interface ItemProposta {
  numero: string;
  texto: string;
}

export function itensRs(c: CondicoesRs): ItemProposta[] {
  return [
    {
      numero: "1.1",
      texto: `Taxa de ${formatarPct(c.taxa_sem_reposicao_pct)} sobre 1º salário – Vagas sem reposição; Taxa de ${formatarPct(c.taxa_com_reposicao_pct)} sobre 1º salário – Vagas c/ 01 reposição dentro dos primeiros 30 dias;`,
    },
    { numero: "1.2", texto: `Os currículos serão enviados em até ${c.prazo_envio_curriculos_dias_uteis} dias úteis;` },
    {
      numero: "1.3",
      texto: `Caso o processo seletivo tenha sido feito com eficiência, currículos enviados, e o mesmo seja cancelado ou congelado, será cobrada uma taxa de ${formatarPct(c.taxa_cancelamento_pct)} sobre o 1º salário da vaga em questão;`,
    },
    { numero: "1.4", texto: `Os candidatos aprovados após exames admissionais serão faturados com Nota Fiscal com até ${c.prazo_faturamento_dias} dias de vencimento;` },
    { numero: "1.5", texto: "A Salmazos RH disponibiliza espaço para entrevistas e dinâmicas de grupo, caso necessário;" },
    { numero: "1.6", texto: "Utilizamos para captação as plataformas SALMAZOS, CATHO, LINKEDIN, INDEED, além de outras mídias;" },
    {
      numero: "1.7",
      texto: "INSTRUMENTOS DE AVALIAÇÃO PSICOLÓGICA (Adicionais, se necessário): AC – Atenção Concentrada; Palográfico – Ritmo/Personalidade; Teste de Estilo de Liderança; PPA | DISC – Comportamental; R-1 – Teste não Verbal de Inteligência; G-38 – Teste não Verbal de Inteligência; Entrevista por Competência.",
    },
  ];
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
  validade_dias: z.number().int(),
  validade_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendedor_nome: z.string(),
  vendedor_telefone: z.string().nullable(),
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
}

export function montarSnapshot(e: EntradaSnapshot): SnapshotProposta {
  const conteudo = conteudoRsSchema.parse(e.conteudo ?? {});
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
    validade_dias: e.validadeDias,
    validade_ate: e.validadeAte,
    vendedor_nome: e.vendedorNome,
    vendedor_telefone: e.vendedorTelefone?.trim() || null,
  };
}
