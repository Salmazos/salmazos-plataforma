// Mensagem de erro das ações da tela Configurações > Avisos, mostrada junto da linha ou do bloco
// clicado. Módulo puro (sem rede): usado no componente e no script de verificação.

// Regra do último destinatário ativo: a API (PATCH desativar / DELETE remover) responde 409.
export const MSG_ULTIMO_DESTINATARIO =
  "Não é possível: este é o último destinatário ativo do canal. Adicione outra pessoa antes ou desligue o canal.";
export const MSG_ACAO_PADRAO = "Não foi possível concluir a ação.";

// `acaoDeLinha`: desativar ou remover um destinatário. Nelas, o 409 SEMPRE é a regra do último
// destinatário ativo, então o texto não depende do que a API escreveu. Nas demais ações (ex.: adicionar
// quem já está na lista, que também responde 409), vale o texto da API.
export function mensagemErroAcao(status: number, corpo: unknown, acaoDeLinha = false): string {
  if (acaoDeLinha && status === 409) return MSG_ULTIMO_DESTINATARIO;
  const c = (corpo ?? {}) as { error?: unknown; mensagem?: unknown; message?: unknown };
  for (const campo of [c.error, c.mensagem, c.message]) {
    if (typeof campo === "string" && campo.trim()) return campo;
  }
  return status === 409 ? MSG_ULTIMO_DESTINATARIO : MSG_ACAO_PADRAO;
}
