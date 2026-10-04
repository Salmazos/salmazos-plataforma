// Resumo, para o CLIENTE no portal, do pedido mais recente de cada tipo (alteração, encerramento,
// reativação). Módulo puro: usado na rota /api/portal/solicitacoes, na página e no script de
// verificação. Só carrega o que o cliente pode ver: nunca quem decidiu nem notas internas.

export type StatusPedidoCliente = "pendente" | "aprovada" | "recusada";

export interface LinhaPedidoCliente {
  status: string;
  criado_em: string;
  decidido_em: string | null;
  motivo_recusa: string | null;
}

export interface ResumoPedidoCliente {
  status: StatusPedidoCliente;
  // pendente: quando foi enviado; aprovada/recusada: quando foi decidido.
  data: string;
  // Só na recusa. É o mesmo texto que o cliente já recebe por e-mail (vaga_status_decidido e
  // alteracao_solicitacao_recusada), então não expõe nada interno.
  motivo_recusa: string | null;
}

// Decidido há mais que isso deixa de aparecer no card.
export const DIAS_VISIVEL_PEDIDO_DECIDIDO = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

const porDataDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

// Pendente tem prioridade (o índice único garante no máximo um); senão, o decidido mais recente
// dentro da janela. "Substituída" e qualquer outro status nunca aparecem.
export function resumirPedidoCliente(linhas: readonly LinhaPedidoCliente[], agora: Date = new Date()): ResumoPedidoCliente | null {
  const pendente = linhas
    .filter((l) => l.status === "pendente")
    .sort((a, b) => porDataDesc(a.criado_em, b.criado_em))[0];
  if (pendente) return { status: "pendente", data: pendente.criado_em, motivo_recusa: null };

  const decidido = linhas
    .filter((l) => l.status === "aprovada" || l.status === "recusada")
    .map((l) => ({ l, quando: l.decidido_em ?? l.criado_em }))
    .sort((a, b) => porDataDesc(a.quando, b.quando))[0];
  if (!decidido) return null;

  const idade = agora.getTime() - new Date(decidido.quando).getTime();
  if (Number.isNaN(idade) || idade > DIAS_VISIVEL_PEDIDO_DECIDIDO * MS_DIA) return null;

  const motivo = decidido.l.motivo_recusa?.trim() || null;
  return {
    status: decidido.l.status as StatusPedidoCliente,
    data: decidido.quando,
    motivo_recusa: decidido.l.status === "recusada" ? motivo : null,
  };
}
