// Contagem dos cards da tela Início do Portal do Cliente (PortalClienteClient).
// Função pura pra poder ser verificada por script, sem renderizar React.

export interface ResumoPortal {
  total: number;
  emTriagem: number;
  aguardando: number;
  aprovados: number;
  reprovados: number;
}

export function resumirPortal(emTriagemQtd: number, statusEncaminhamentos: string[]): ResumoPortal {
  const aguardando = statusEncaminhamentos.filter(
    (s) => s === "aguardando" || s === "aguardando_agendamento_cliente"
  ).length;
  const aprovados = statusEncaminhamentos.filter((s) => s === "aprovado").length;
  const reprovados = statusEncaminhamentos.filter((s) => s === "reprovado").length;
  // ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O NEGÓCIO: o Total é a soma dos cards visíveis.
  // Encaminhamento 'desistiu' não tem card e, por isso, não entra no Total.
  return {
    total: emTriagemQtd + aguardando + aprovados + reprovados,
    emTriagem: emTriagemQtd,
    aguardando,
    aprovados,
    reprovados,
  };
}
