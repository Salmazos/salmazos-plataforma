// Unidade de FATURAMENTO (Monte Mor | Hortolândia): dimensão só de faturamento/divisão de lucro,
// separada da unidade de visibilidade (unidade_id). Módulo sem dependência de servidor para poder
// ser usado nas telas (faturamentoUnidades.ts reexporta). NULL no banco = "a definir".

export const UNIDADES_FATURAMENTO = ["monte_mor", "hortolandia"] as const;
export type UnidadeFaturamento = (typeof UNIDADES_FATURAMENTO)[number];

// "a_definir" nunca é gravado: é só o rótulo de quem está NULL (ou com valor desconhecido).
export type BucketFaturamento = UnidadeFaturamento | "a_definir";

export const ROTULO_BUCKET_FATURAMENTO: Record<BucketFaturamento, string> = {
  hortolandia: "Hortolândia",
  monte_mor: "Monte Mor",
  a_definir: "A definir",
};

// Filtro vindo da URL/consulta: só os 3 valores conhecidos valem; qualquer outra coisa = sem filtro.
export function lerBucketFaturamento(valor: string | null | undefined): BucketFaturamento | null {
  return valor === "a_definir" || ehUnidadeFaturamento(valor) ? valor : null;
}

export function ehUnidadeFaturamento(valor: unknown): valor is UnidadeFaturamento {
  return typeof valor === "string" && (UNIDADES_FATURAMENTO as readonly string[]).includes(valor);
}

// Valor desconhecido cai em "a definir" em vez de sumir da tela (regra: NULL nunca some).
export function bucketFaturamento(valor: string | null | undefined): BucketFaturamento {
  return ehUnidadeFaturamento(valor) ? valor : "a_definir";
}

export function filtrarPorBucket<T extends { unidadeFaturamento: string | null }>(itens: T[], bucket: BucketFaturamento): T[] {
  return itens.filter((i) => bucketFaturamento(i.unidadeFaturamento) === bucket);
}

export function contarPorBucket<T extends { unidadeFaturamento: string | null }>(itens: T[]): Record<BucketFaturamento, number> {
  const contagem: Record<BucketFaturamento, number> = { hortolandia: 0, monte_mor: 0, a_definir: 0 };
  for (const i of itens) contagem[bucketFaturamento(i.unidadeFaturamento)]++;
  return contagem;
}

// Só a unidade de visibilidade compartilhada (slug monte-mor-hortolandia) divide em Monte Mor /
// Hortolândia. SBC segue só por unidade_id e não usa o campo.
export const SLUG_UNIDADE_COMPARTILHADA = "monte-mor-hortolandia";
export function usaUnidadeFaturamento(slugUnidade: string | null | undefined): boolean {
  return slugUnidade === SLUG_UNIDADE_COMPARTILHADA;
}

export const MSG_UNIDADE_FATURAMENTO_OBRIGATORIA = "Escolha a unidade de faturamento (Hortolândia ou Monte Mor).";

export type DecisaoUnidadeFaturamento =
  | { ok: true; campo: { unidade_faturamento?: UnidadeFaturamento | null } }
  | { ok: false; erro: string };

// O que gravar em unidade_faturamento. `campo` é espalhado direto no insert/update: vazio = a coluna
// não é tocada (omitida mesmo antes da migração rodar). Na unidade que não usa o campo (SBC) o que
// vier é descartado. Na criação (obrigatoria) falta de valor é erro; na edição, ausente mantém e
// null volta o item para "a definir".
export function decidirUnidadeFaturamento(
  slugUnidade: string | null | undefined,
  enviada: string | null | undefined,
  obrigatoria: boolean
): DecisaoUnidadeFaturamento {
  if (!usaUnidadeFaturamento(slugUnidade)) return { ok: true, campo: {} };
  if (enviada === undefined || enviada === null) {
    if (obrigatoria) return { ok: false, erro: MSG_UNIDADE_FATURAMENTO_OBRIGATORIA };
    return { ok: true, campo: enviada === null ? { unidade_faturamento: null } : {} };
  }
  if (!ehUnidadeFaturamento(enviada)) return { ok: false, erro: "Unidade de faturamento inválida." };
  return { ok: true, campo: { unidade_faturamento: enviada } };
}
