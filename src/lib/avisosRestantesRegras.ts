// Avisos INTERNOS que ainda estavam fixos no código (transferência de responsável, currículo atualizado, funcionário
// não criado, agendamento do cliente, lembretes, atrasos, fee ausente e aniversários). Módulo puro (sem imports): usado
// nas libs de aviso, nas rotas/crons e no script de verificação. Os textos são os de sempre; só candidato, vaga,
// cliente e datas: nunca fee, notas internas ou decisor.

export const EVENTO_CANDIDATO_TRANSFERIDO = "candidato_transferido";
export const EVENTO_CURRICULO_ATUALIZADO = "candidato_curriculo_atualizado";
export const EVENTO_FUNCIONARIO_NAO_CRIADO = "funcionario_nao_criado";

export const EVENTO_LEMBRETE_COMERCIAL = "lembrete_comercial";
export const EVENTO_SUPERVISAO_ATRASADA = "supervisao_cliente_atrasada";
export const EVENTO_CONTA_HORTOLANDIA_ATRASADA = "conta_receber_hortolandia_atrasada";
export const EVENTO_FEE_RS_NAO_CONFIGURADO = "fee_rs_nao_configurado";
export const EVENTO_ANIVERSARIO_MES_SEGUINTE = "aniversario_mes_seguinte";
export const EVENTO_ANIVERSARIO_TRES_DIAS = "aniversario_tres_dias";
export const EVENTO_ANIVERSARIO_NO_DIA = "aniversario_no_dia";

// `notificacoes_analista.tipo` de SEMPRE: os eventos são novos, os tipos gravados não mudaram.
export const TIPO_TRANSFERENCIA_RESPONSAVEL = "transferencia_responsavel";
export const TIPO_ATUALIZACAO_CURRICULO = "atualizacao_curriculo";
export const TIPO_FUNCIONARIO_NAO_CRIADO = "funcionario_nao_criado_automaticamente";
export const TIPO_LEMBRETE_COMERCIAL = "lembrete_comercial";
export const TIPO_SUPERVISAO_ATRASADA = "supervisao_cliente_atrasada";
export const TIPO_CONTA_HORTOLANDIA_ATRASADA = "conta_receber_hortolandia_atrasada";
export const TIPO_FEE_RS_NAO_CONFIGURADO = "fee_rs_nao_configurado";
export const TIPO_ANIVERSARIO_MES_SEGUINTE = "aniversario_mes_seguinte";
export const TIPO_ANIVERSARIO_TRES_DIAS = "aniversario_tres_dias";
export const TIPO_ANIVERSARIO_NO_DIA = "aniversario_no_dia";

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

// Lembrete do Comercial: ao vendedor (o texto de sempre, "Você tem…") e, para a lista de gestão, o mesmo aviso com o nome do
// vendedor. A mensagem do vendedor sempre começa com PREFIXO_MENSAGEM_VENDEDOR: é por ela que a dedup do dia o reconhece.
export const PREFIXO_MENSAGEM_VENDEDOR = "Você tem ";
export function textoLembreteComercial(o: { quantidade: number }): TextoAviso {
  const n = o.quantidade;
  return { titulo: "Hora de retomar contato", mensagem: `${PREFIXO_MENSAGEM_VENDEDOR}${n} empresa${n !== 1 ? "s" : ""} esperando seu retorno.` };
}
export function textoLembreteComercialGestao(o: { vendedor?: string | null; quantidade: number }): TextoAviso {
  const n = o.quantidade;
  return {
    titulo: "Equipe comercial: retomar contato",
    mensagem: `${o.vendedor?.trim() || "Um vendedor"} tem ${n} empresa${n !== 1 ? "s" : ""} esperando retorno.`,
  };
}

// Supervisão atrasada: os textos de sempre. dias nulo = cliente sem nenhuma supervisão registrada.
export function textoSupervisaoAtrasada(o: { cliente: string; dias: number | null }): TextoAviso {
  const diasLabel = o.dias == null ? "sem registro" : `atrasado há ${o.dias} dia${o.dias !== 1 ? "s" : ""}`;
  return { titulo: `🔴 Supervisão pendente — ${o.cliente}`, mensagem: `${o.cliente} — ${diasLabel}.` };
}

// Faturamento atrasado (lançamento a receber vencido e pendente): os textos de sempre. Só cliente, NF e datas, nunca o valor.
export function textoContaReceberAtrasada(o: {
  unidade: string;
  diasAtraso: number;
  cliente: string;
  numeroNf?: string | null;
  vencimentoISO: string;
}): TextoAviso {
  return {
    titulo: `🔴 Faturamento ${o.unidade} atrasado há ${o.diasAtraso} dia${o.diasAtraso !== 1 ? "s" : ""}`,
    mensagem: `${o.cliente}${o.numeroNf ? ` — NF ${o.numeroNf}` : ""} — vencida em ${o.vencimentoISO.split("-").reverse().join("/")}, ainda não paga.`,
  };
}

// ── Aniversários de contatos de clientes ──
// O cron roda uma vez por dia. Além do dia exato, recupera até 2 dias para trás (o cron pode ter falhado): o dedup é a
// tabela aniversario_notificacoes_enviadas, uma linha por contato, tipo e ano da OCORRÊNCIA do aniversário.
export const DIAS_ANTECEDENCIA_ANIVERSARIO = 3;
export const DIAS_RECUPERACAO_ANIVERSARIO = 2;

const DIA_MS = 86_400_000;

export interface SituacaoAniversario {
  // Faltam `dias` (1 a 3) para o aniversário; `ano` é o ano em que ele cai (dedup).
  tresDias: { dias: number; ano: number } | null;
  // O aniversário foi há `atraso` dias (0 = hoje, até 2); `ano` é o ano do aniversário (dedup).
  noDia: { atraso: number; ano: number } | null;
}

// dataNascimento "AAAA-MM-DD" (só mês e dia contam) e hojeISO "AAAA-MM-DD" (Brasília). Como sempre foi: o aviso "no dia" só
// vale quando mês e dia batem exatamente (29/02 só em ano bissexto); o "faltam N dias" usa a data do ano (29/02 vira 01/03).
export function situacaoAniversario(dataNascimento: string, hojeISO: string): SituacaoAniversario {
  const [, mes, dia] = dataNascimento.split("-").map(Number);
  const [hy, hm, hd] = hojeISO.split("-").map(Number);
  const hoje = Date.UTC(hy, hm - 1, hd);

  let noDia: SituacaoAniversario["noDia"] = null;
  for (let k = 0; k <= DIAS_RECUPERACAO_ANIVERSARIO && !noDia; k++) {
    const d = new Date(hoje - k * DIA_MS);
    if (d.getUTCMonth() + 1 === mes && d.getUTCDate() === dia) noDia = { atraso: k, ano: d.getUTCFullYear() };
  }

  let tresDias: SituacaoAniversario["tresDias"] = null;
  for (const ano of [hy, hy + 1]) {
    if (tresDias) break;
    const ocorrencia = Date.UTC(ano, mes - 1, dia);
    const dias = Math.round((ocorrencia - hoje) / DIA_MS);
    if (dias >= 1 && dias <= DIAS_ANTECEDENCIA_ANIVERSARIO) tresDias = { dias, ano: new Date(ocorrencia).getUTCFullYear() };
  }
  return { tresDias, noDia };
}

const rotuloDias = (n: number) => `${n} dia${n !== 1 ? "s" : ""}`;

// Sino e e-mail do "faltam N dias". Com N = 3 (o dia de sempre) os textos são exatamente os de antes.
export function textoAniversarioTresDias(o: { nome: string; empresa: string; dataFmt: string; dias: number }): {
  titulo: string; mensagem: string; assunto: string; tituloEmail: string;
} {
  return {
    titulo: `🎂 Faltam ${rotuloDias(o.dias)} — aniversário de ${o.nome}`,
    mensagem: `${o.nome} (${o.empresa}) faz aniversário em ${rotuloDias(o.dias)}, dia ${o.dataFmt}.`,
    assunto: `🎂 Faltam ${rotuloDias(o.dias)} — aniversário de ${o.nome} (${o.empresa})`,
    tituloEmail: `🎂 Faltam ${rotuloDias(o.dias)}!`,
  };
}

// No dia (atraso 0) os textos de sempre; numa recuperação (atraso 1 ou 2) falam da data, nunca de "hoje".
export function textoAniversarioNoDia(o: { nome: string; empresa: string; dataFmt: string; atraso: number }): {
  titulo: string; mensagem: string; assunto: string; tituloEmail: string;
} {
  if (o.atraso === 0) {
    return {
      titulo: `🎂 Hoje é aniversário de ${o.nome}!`,
      mensagem: `Hoje é o aniversário de ${o.nome} (${o.empresa}).`,
      assunto: `🎂 Hoje é aniversário de ${o.nome} (${o.empresa})!`,
      tituloEmail: `🎂 Hoje é aniversário de ${o.nome}!`,
    };
  }
  return {
    titulo: `🎂 Aniversário de ${o.nome} — ${o.dataFmt}`,
    mensagem: `O aniversário de ${o.nome} (${o.empresa}) foi dia ${o.dataFmt}.`,
    assunto: `🎂 Aniversário de ${o.nome} (${o.empresa}) — ${o.dataFmt}`,
    tituloEmail: `🎂 Aniversário de ${o.nome} — ${o.dataFmt}`,
  };
}
