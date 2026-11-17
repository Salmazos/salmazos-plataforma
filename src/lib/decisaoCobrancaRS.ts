// Textos e regras da pergunta "Gerar cobrança de R&S?" do modal de finalização. Funções puras para o teste conferir o que a tela diz.

export const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Fee que a cobrança teria: o já lançado (portal/analista) ou salário digitado × % da vaga. null = ainda não dá para calcular.
export function feeDaContratacao(o: { feeJaLancado: number | null; salario: number | null; percentual: number | null }): number | null {
  if (o.feeJaLancado != null) return o.feeJaLancado;
  if (o.salario != null && o.salario > 0 && o.percentual != null) return Math.round(o.salario * o.percentual) / 100;
  return null;
}

export function textoConfirmarNaoGerar(o: { fee: number | null; percentual: number | null }): string {
  const valor = o.fee != null ? `R$ ${brl(o.fee)}` : "valor ainda não calculado";
  const pct = o.percentual != null ? `${String(o.percentual).replace(".", ",")}%` : "taxa não definida";
  return `Você escolheu NÃO gerar cobrança de ${valor} (fee de ${pct}). Confirmar?`;
}

export const ROTULO_CONTRATAR_SEM_COBRANCA = "Contratar sem cobrança";

// Rótulo do botão final quando a vaga é R&S e a decisão já foi tomada; nos demais casos vale o rótulo padrão da tela.
export function rotuloBotaoContratar(o: { rs: boolean; gerar: boolean | null; padrao: string }): string {
  return o.rs && o.gerar === false ? ROTULO_CONTRATAR_SEM_COBRANCA : o.padrao;
}
