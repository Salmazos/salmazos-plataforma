// O lançamento em Faturamento Unidades não tem coluna que aponte para a cobrança R&S (sem
// migration, por decisão do negócio); o vínculo é este marcador no texto das observações, usado
// também para avisar quando a mesma cobrança já foi lançada.
export function marcadorCobrancaNaObservacao(cobrancaId: string): string {
  return `(cobrança ${cobrancaId.slice(0, 8)})`;
}

export function observacaoLancamentoCobranca(c: {
  id: string;
  candidato: string | null;
  vaga: string | null;
}): string {
  const partes = [c.candidato ? `candidato ${c.candidato}` : null, c.vaga ? `vaga ${c.vaga}` : null].filter(Boolean);
  return `Cobrança R&S${partes.length ? " — " + partes.join(", ") : ""} ${marcadorCobrancaNaObservacao(c.id)}`;
}
