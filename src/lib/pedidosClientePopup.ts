// Tipos de pedido do cliente que entram no popup "Pedidos do cliente" e o evento (lista de
// destinatários do canal popup, em Configurações > Avisos) de cada um. Módulo puro: usado no
// servidor, no componente e no script de verificação.

export type TipoPedidoCliente = "alteracao" | "reativacao" | "pausa";

export const TIPOS_PEDIDO_CLIENTE: readonly TipoPedidoCliente[] = ["alteracao", "reativacao", "pausa"];

export const EVENTO_POR_TIPO_PEDIDO: Record<TipoPedidoCliente, string> = {
  alteracao: "solicitacao_alteracao_pedida",
  reativacao: "vaga_reativacao_pedida",
  pausa: "vaga_pausa_pedida",
};

export const ROTULO_TIPO_PEDIDO: Record<TipoPedidoCliente, string> = {
  alteracao: "Pediu alteração",
  reativacao: "Pediu reativação",
  pausa: "Pediu encerramento",
};

// Quais tipos o usuário vê: só os cujo evento tem lista de popup CONFIGURADA com ele dentro.
// Canal desligado, sem configuração ou falha ao ler = não vê (o popup só existe com configuração).
export function tiposVisiveis(
  listas: Record<TipoPedidoCliente, { modo: string; userIds: string[] }>,
  userId: string
): TipoPedidoCliente[] {
  return TIPOS_PEDIDO_CLIENTE.filter((t) => listas[t].modo === "configurado" && listas[t].userIds.includes(userId));
}

export const chaveVisto = (tipo: string, id: string) => `${tipo}:${id}`;
