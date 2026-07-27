interface SolicitacaoDecisao {
  status: string;
  aprovada_por: string | null;
  aprovada_em: string | null;
  motivo_recusa: string | null;
}

// Usado tanto nos 409 de from-solicitacao/recusar (quando dois analistas tentam
// decidir a mesma solicitação ao mesmo tempo) quanto no card informativo do modal
// (quando o clique numa notificação chega depois de a solicitação já ter sido
// decidida por outra pessoa) — mesma mensagem, uma única fonte de verdade.
export function mensagemDecisaoSolicitacao(sol: SolicitacaoDecisao): string {
  const quem = sol.aprovada_por ?? "outro analista";
  const quando = sol.aprovada_em
    ? new Date(sol.aprovada_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "";
  const acao = sol.status === "aprovada" ? "aprovada" : "recusada";

  let msg = `Esta solicitação já foi ${acao} por ${quem}${quando ? ` em ${quando}` : ""}.`;
  if (sol.status === "recusada" && sol.motivo_recusa) {
    msg += ` Motivo: ${sol.motivo_recusa}`;
  }
  return msg;
}
