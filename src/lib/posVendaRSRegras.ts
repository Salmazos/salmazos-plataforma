// Avisos INTERNOS de pós-venda R&S (sino, popup e e-mail para a equipe comercial). Módulo puro (sem imports): usado
// no cron, na API do popup e no script de verificação. As duas funções de data repetem as de garantiaRS.ts (módulos
// puros não importam outros); o script confere que dão o mesmo resultado.

// Evento de Configurações > Avisos (grupo Vagas).
export const EVENTO_POS_VENDA_RS = "pos_venda_rs_7dias";

// `notificacoes_analista.tipo` e `email_logs.tipo` de SEMPRE: o catálogo ganhou o evento, o tipo de gravação não mudou.
export const TIPO_NOTIFICACAO_POS_VENDA_RS = "pos_venda_rs";

// Tipo de notificação -> evento cujo canal popup liga/desliga o popup de pós-venda (PopupPosVendaRSHoje).
export const EVENTO_POR_TIPO_POS_VENDA: Record<string, string> = { [TIPO_NOTIFICACAO_POS_VENDA_RS]: EVENTO_POS_VENDA_RS };

// ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O OLVER (14/09): o aviso sai 7 dias corridos depois do início do candidato.
export const DIAS_POS_VENDA_RS = 7;
// Se o cron falhou, recupera até este número de dias para trás (pos_venda_notificado_em evita repetir).
export const DIAS_RECUPERACAO_POS_VENDA_RS = 2;

// "Hoje" no fuso de Brasília. Formato AAAA-MM-DD.
export function dataBrasilia(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function somarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Janela do cron sobre data_inicio: data_inicio + 7 entre (hoje - 2) e hoje  <=>  data_inicio entre (hoje - 9) e (hoje - 7).
export function janelaInicioPosVenda(agora: Date = new Date()): { inicioMin: string; inicioMax: string; hoje: string } {
  const hoje = dataBrasilia(agora);
  return {
    inicioMin: somarDiasISO(hoje, -(DIAS_POS_VENDA_RS + DIAS_RECUPERACAO_POS_VENDA_RS)),
    inicioMax: somarDiasISO(hoje, -DIAS_POS_VENDA_RS),
    hoje,
  };
}

export function posVendaNaJanela(dataInicio: string | null | undefined, agora: Date = new Date()): boolean {
  if (!dataInicio) return false;
  const { inicioMin, inicioMax } = janelaInicioPosVenda(agora);
  return dataInicio >= inicioMin && dataInicio <= inicioMax;
}

const formatarDataBR = (iso: string): string => iso.split("-").reverse().join("/");

// Sino e e-mail: os textos de sempre ("completou 7 dias", com a data de início; nunca "hoje", porque o cron pode
// recuperar um aviso dos 2 dias anteriores). Só candidato, cliente, vaga e início: nunca fee, notas ou decisor.
export function textoAvisoPosVendaRS(o: {
  candidato?: string | null;
  vagaTitulo?: string | null;
  cliente?: string | null;
  dataInicio: string;
}): { titulo: string; mensagem: string } {
  const candidato = o.candidato?.trim() || "Candidato";
  const vaga = o.vagaTitulo?.trim() || "Vaga";
  const cliente = o.cliente?.trim() || "Cliente";
  const inicio = formatarDataBR(o.dataInicio);
  return {
    titulo: `🤝 Hora do pós-venda: ${candidato} — ${cliente}`,
    mensagem: `${candidato} completou 7 dias na vaga "${vaga}" (${cliente}), início em ${inicio}. Hora de fazer o contato de pós-venda com o cliente.`,
  };
}

// Quem recebe o sino: os destinatários de sempre (responsável comercial do cliente, ou o time comercial da unidade)
// MAIS a lista do canal sino, uma vez cada (ordem: os de sempre primeiro).
export function userIdsSinoPosVenda(deSempre: readonly string[], lista: readonly string[]): string[] {
  return [...new Set([...deSempre, ...lista].filter(Boolean))];
}

// "sem_destinatario": o canal estava ligado mas não havia a quem entregar.
export type ResultadoCanalPosVenda = "enviado" | "desligado" | "falhou" | "sem_destinatario";

// Carimbo de pos_venda_notificado_em: grava se algo foi ENTREGUE ou se todos os canais estão desligados (nada a
// enviar). Se havia canal ligado e nada foi entregue (falha ou sem destinatário), NÃO grava: a próxima execução, dentro
// da janela de 2 dias, tenta de novo.
export function deveCarimbarPosVenda(resultados: readonly ResultadoCanalPosVenda[]): boolean {
  if (resultados.some((r) => r === "enviado")) return true;
  return resultados.every((r) => r === "desligado");
}
