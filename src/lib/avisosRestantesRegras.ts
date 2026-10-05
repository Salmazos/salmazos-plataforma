// Avisos INTERNOS que ainda estavam fixos no código (transferência de responsável, currículo atualizado, funcionário
// não criado, agendamento do cliente, lembretes, atrasos, fee ausente e aniversários). Módulo puro (sem imports): usado
// nas libs de aviso, nas rotas/crons e no script de verificação. Os textos são os de sempre; só candidato, vaga,
// cliente e datas: nunca fee, notas internas ou decisor.

export const EVENTO_CANDIDATO_TRANSFERIDO = "candidato_transferido";
export const EVENTO_CURRICULO_ATUALIZADO = "candidato_curriculo_atualizado";
export const EVENTO_FUNCIONARIO_NAO_CRIADO = "funcionario_nao_criado";

// `notificacoes_analista.tipo` de SEMPRE: os eventos são novos, os tipos gravados não mudaram.
export const TIPO_TRANSFERENCIA_RESPONSAVEL = "transferencia_responsavel";
export const TIPO_ATUALIZACAO_CURRICULO = "atualizacao_curriculo";
export const TIPO_FUNCIONARIO_NAO_CRIADO = "funcionario_nao_criado_automaticamente";

// "sem_destinatario": o canal estava ligado mas não havia a quem entregar.
export type ResultadoCanalAviso = "enviado" | "desligado" | "falhou" | "sem_destinatario";

// Quem recebe o sino: os destinatários de sempre MAIS a lista do canal, uma vez cada (os de sempre primeiro).
export function unirUserIds(deSempre: readonly (string | null | undefined)[], lista: readonly string[]): string[] {
  return [...new Set([...deSempre, ...lista].filter((x): x is string => !!x))];
}

// Carimbo/dedup: grava se algo foi ENTREGUE ou se todos os canais estão desligados (nada a enviar). Com canal ligado e
// nada entregue (falha ou sem destinatário) NÃO grava: a próxima execução tenta de novo.
export function deveCarimbarAviso(resultados: readonly ResultadoCanalAviso[]): boolean {
  if (resultados.some((r) => r === "enviado")) return true;
  return resultados.every((r) => r === "desligado");
}

export interface TextoAviso {
  titulo: string;
  mensagem: string;
}

// Responsável antigo: o texto de sempre. Responsável novo: avisa quem passou a cuidar do candidato. Lista: texto genérico.
export function textoTransferenciaResponsavel(o: {
  candidato?: string | null;
  antigo?: string | null;
  novo?: string | null;
}): { antigo: TextoAviso; novo: TextoAviso; lista: TextoAviso } {
  const candidato = o.candidato?.trim() || "Candidato";
  const antigo = o.antigo?.trim() || "Sem responsável";
  const novo = o.novo?.trim() || "Sem responsável";
  return {
    antigo: { titulo: "Candidato transferido", mensagem: `${candidato} foi transferido para ${novo}` },
    novo: { titulo: "Candidato transferido para você", mensagem: `${candidato} foi transferido para você (antes: ${antigo}).` },
    lista: { titulo: "Candidato transferido", mensagem: `${candidato} foi transferido de ${antigo} para ${novo}.` },
  };
}

export function textoCurriculoAtualizado(o: { candidato?: string | null; resumo?: string | null }): TextoAviso {
  return {
    titulo: `Currículo atualizado: ${o.candidato?.trim() || "Candidato"}`,
    mensagem: o.resumo?.trim() || "O candidato atualizou o currículo.",
  };
}

export function textoFuncionarioNaoCriado(o: { candidato?: string | null }): TextoAviso {
  return {
    titulo: "Funcionário não foi criado automaticamente",
    mensagem: `O pacote de admissão de "${o.candidato?.trim() || "Candidato"}" foi gerado, mas o registro em Funcionários não foi criado automaticamente. Verifique e crie manualmente se necessário.`,
  };
}

// Guarda de repetição por consulta (sem coluna nova): não repetir o mesmo aviso dentro desta janela.
export const HORAS_SEM_REPETIR_AVISO = 24;
export function inicioJanelaSemRepetir(agora: Date = new Date(), horas: number = HORAS_SEM_REPETIR_AVISO): string {
  return new Date(agora.getTime() - horas * 60 * 60 * 1000).toISOString();
}
