// Vocabulário do funil comercial. Módulo puro (sem imports de servidor): usado no client e no server.
// Os códigos gravados no banco NÃO mudam — só a apresentação. "negociacao" é legado: não se usa em
// registros novos, mas dado antigo continua existindo e aparece como "Proposta enviada".

export const ROTULO_ETAPA: Record<string, string> = {
  prospeccao: "Prospecção",
  contato_feito: "Contato feito",
  reuniao_visita: "Reunião/Visita",
  proposta_enviada: "Proposta enviada",
  negociacao: "Proposta enviada",
  ganho: "Venda fechada",
  perdido: "Não desta vez",
};

export const ROTULO_RESULTADO_CONTATO: Record<string, string> = {
  sem_interesse: "Sem necessidade agora",
  retornar: "Combinamos novo contato",
  quer_proposta: "Pediu proposta",
  fechou: "Fechamos",
  nao_encontrou: "Ainda não consegui falar",
};

export const ROTULO_MOTIVO_PERDA: Record<string, string> = {
  sem_necessidade: "Sem necessidade no momento",
  valor_acima_orcamento: "Valor acima do orçamento",
  outro_fornecedor: "Optou por outro fornecedor",
  sem_retorno: "Sem retorno do cliente",
  resolveu_internamente: "Resolveu internamente",
  outro: "Outro motivo",
};

export const ROTULO_ORIGEM: Record<string, string> = {
  ligacao: "Ligação",
  indicacao: "Indicação",
  outro: "Outro",
  km: "Visita (KM)",
};

export function rotuloEtapa(codigo: string): string {
  return ROTULO_ETAPA[codigo] ?? codigo;
}

// Aberta = qualquer fase que não seja resultado final (inclui "negociacao" legado).
export function ehAberta(etapa: string): boolean {
  return etapa !== "ganho" && etapa !== "perdido";
}
