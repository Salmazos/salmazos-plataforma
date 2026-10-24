// Condições comerciais do link público de solicitação de vaga. A fonte única dos textos e dos limites é propostaModelos.ts (as
// mesmas cláusulas da proposta R&S em PDF): aqui só se lê o que o analista gravou no link e se renderiza com itensRs/itensAdicionais.
import {
  PADROES_RS,
  condicoesRsSchema,
  itensAdicionais,
  itensRs,
  quantidadeItensFixosRs,
  type CondicoesRs,
  type ItemProposta,
} from "@/lib/propostaModelos";

// Texto numerado exatamente como no PDF da proposta: com taxa de cancelamento 0 a cláusula some e as adicionais sobem de número.
export function itensDasCondicoes(condicoes: CondicoesRs, clausulasAdicionais: string[]): ItemProposta[] {
  return [
    ...itensRs(condicoes),
    ...itensAdicionais(clausulasAdicionais, quantidadeItensFixosRs(condicoes.taxa_cancelamento_pct) + 1),
  ];
}

// Lê as condições do registro do link. Coluna nula ou fora do formato cai nos padrões da proposta (nunca derruba a página).
export function lerCondicoesDoLink(link: { condicoes: unknown; clausulas_adicionais: unknown }): { condicoes: CondicoesRs; clausulas: string[] } {
  const parsed = condicoesRsSchema.safeParse(link.condicoes ?? {});
  const clausulas = Array.isArray(link.clausulas_adicionais)
    ? link.clausulas_adicionais.filter((c): c is string => typeof c === "string" && c.trim() !== "")
    : [];
  return { condicoes: parsed.success ? parsed.data : PADROES_RS, clausulas };
}

export interface CondicoesAceitas {
  condicoes: CondicoesRs;
  clausulas_adicionais: string[];
  itens: ItemProposta[];
  link_id: string;
}

// Foto das condições que o cliente viu e aceitou. Sai SÓ do registro do link (nunca do corpo da requisição) e é gravada na
// solicitação: mudar ou revogar o link depois não altera solicitações já enviadas.
export function montarSnapshotCondicoes(link: { id: string; condicoes: unknown; clausulas_adicionais: unknown }): CondicoesAceitas {
  const { condicoes, clausulas } = lerCondicoesDoLink(link);
  return { condicoes, clausulas_adicionais: clausulas, itens: itensDasCondicoes(condicoes, clausulas), link_id: link.id };
}

// "Condições personalizadas": diferentes dos padrões da proposta (algum percentual/prazo ou cláusula adicional).
export function condicoesPersonalizadas(aceitas: { condicoes?: Partial<CondicoesRs> | null; clausulas_adicionais?: string[] | null } | null | undefined): boolean {
  if (!aceitas) return false;
  if ((aceitas.clausulas_adicionais?.length ?? 0) > 0) return true;
  const c = aceitas.condicoes ?? {};
  return (Object.keys(PADROES_RS) as (keyof CondicoesRs)[]).some((k) => c[k] !== PADROES_RS[k]);
}
