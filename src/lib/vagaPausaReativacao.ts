// Pedido de pausa/reabertura de vaga feito pelo cliente no portal (ver
// migration_vaga_solicitacoes_status.sql). Regras de quando o botão aparece pro cliente e
// os rótulos usados tanto no portal quanto no painel (ModalSolicitacoesVagas) ficam aqui,
// sem dependência de servidor, pra dar pra usar dos dois lados.

export type MotivoTipoEncerramento = "preenchida_internamente" | "nao_precisa_mais" | "outro";

export const ROTULO_MOTIVO_ENCERRAMENTO: Record<MotivoTipoEncerramento, string> = {
  preenchida_internamente: "Já preenchi a vaga por conta própria",
  nao_precisa_mais: "Não preciso mais desta vaga",
  outro: "Outro motivo",
};

// Cliente só pode pedir pausa numa solicitação aprovada cuja vaga está aberta agora, e só
// se não houver outro pedido (pausar ou reabrir) ainda aguardando decisão.
export function clientePodeSolicitarPausa(
  status: string,
  vagaStatus: string | null,
  temPedidoPendente: boolean
): boolean {
  return status === "aprovada" && vagaStatus === "aberta" && !temPedidoPendente;
}

// Reabertura só faz sentido se a vaga está pausada agora.
export function clientePodeSolicitarReativacao(
  status: string,
  vagaStatus: string | null,
  temPedidoPendente: boolean
): boolean {
  return status === "aprovada" && vagaStatus === "pausada" && !temPedidoPendente;
}
