// Avisos INTERNOS da garantia R&S (sino, popup e e-mail para a equipe da Salmazos). Módulo puro (sem
// imports): usado no cron, na rota de acionar, na API do popup e no script de verificação.

export type EventoGarantia = "vencendo" | "acionada";

// Eventos de Configurações > Avisos (grupo Vagas).
export const EVENTO_POR_GARANTIA: Record<EventoGarantia, string> = {
  vencendo: "garantia_rs_vencendo",
  acionada: "garantia_rs_acionada",
};

// `notificacoes_analista.tipo` e `email_logs.tipo` de cada aviso. São os valores de SEMPRE: o catálogo ganhou
// eventos novos, mas estes tipos de gravação não foram renomeados.
export const TIPO_NOTIFICACAO_POR_GARANTIA: Record<EventoGarantia, string> = {
  vencendo: "alerta_garantia_rs",
  acionada: "garantia_acionada",
};

// O cron alerta no último dia da garantia e, se ele falhou, recupera até este número de dias para trás.
export const DIAS_RECUPERACAO_GARANTIA = 2;

// "Hoje" no fuso de Brasília (sem horário de verão desde 2019). Formato AAAA-MM-DD.
export function dataBrasilia(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function somarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Janela do cron: garantia_data_fim entre (hoje - 2 dias) e hoje, no fuso de Brasília.
export function janelaAlertaGarantia(agora: Date = new Date()): { inicio: string; fim: string } {
  const fim = dataBrasilia(agora);
  return { inicio: somarDiasISO(fim, -DIAS_RECUPERACAO_GARANTIA), fim };
}

// A garantia vale até o fim do dia da data de vencimento, em horário de Brasília (-03:00). Antes valia até
// 23:59:59 UTC, o que vence às 20:59 em Brasília. Sem data = não expirou (como era).
export function garantiaExpirada(garantiaFim: string | null | undefined, agora: Date = new Date()): boolean {
  if (!garantiaFim) return false;
  return new Date(`${garantiaFim}T23:59:59-03:00`) < agora;
}

export const formatarDataBR = (iso: string): string => iso.split("-").reverse().join("/");

// Sino e popup do vencimento. Usa a DATA de vencimento (e não "hoje"): o cron pode recuperar um alerta
// que falhou nos 2 dias anteriores. Só candidato, vaga e cliente; nunca fee, notas ou decisor.
export function textoAvisoGarantiaVencendo(o: {
  candidato?: string | null;
  vagaTitulo?: string | null;
  cliente?: string | null;
  dataFim: string;
}): { titulo: string; mensagem: string } {
  const candidato = o.candidato?.trim() || "Candidato";
  const vaga = o.vagaTitulo?.trim() || "Vaga";
  const cliente = o.cliente?.trim() || "Cliente";
  const data = formatarDataBR(o.dataFim);
  return {
    titulo: `⚠️ Garantia R&S com vencimento em ${data}: ${candidato}`,
    mensagem: `A garantia de reposição de ${candidato} na vaga "${vaga}" (${cliente}) tem vencimento em ${data}.`,
  };
}

// Sino e popup da garantia acionada (os textos de sempre).
export function textoAvisoGarantiaAcionada(o: {
  candidato?: string | null;
  vagaTitulo?: string | null;
  cliente?: string | null;
}): { titulo: string; mensagem: string } {
  const candidato = o.candidato?.trim() || "Candidato";
  const vaga = o.vagaTitulo?.trim() || "vaga";
  const cliente = o.cliente?.trim() || "Cliente";
  return {
    titulo: `🔄 Garantia acionada: ${candidato}`,
    mensagem: `Reposição gratuita iniciada para ${vaga} (${cliente}). Nova vaga aberta.`,
  };
}

// Textos do e-mail do vencimento. No dia do vencimento saem EXATAMENTE os de sempre ("Hoje é o último dia…",
// "vence HOJE!"); numa recuperação (alerta atrasado) o texto passa a falar da data, para nunca dizer "hoje"
// de um vencimento que já passou.
export function textosEmailGarantiaVencendo(o: {
  candidato: string;
  cliente: string;
  dataFim: string;
  hojeISO: string;
}): { assunto: string; titulo: string; destaque: string } {
  const data = formatarDataBR(o.dataFim);
  if (o.dataFim === o.hojeISO) {
    return {
      assunto: `⚠️ Hoje é o último dia da garantia de ${o.candidato} — ${o.cliente}`,
      titulo: "⚠️ Último dia da garantia R&S",
      destaque: "🚨 A garantia vence HOJE!",
    };
  }
  return {
    assunto: `⚠️ Garantia R&S com vencimento em ${data}: ${o.candidato} — ${o.cliente}`,
    titulo: "⚠️ Garantia R&S no vencimento",
    destaque: `🚨 A garantia tem vencimento em ${data}!`,
  };
}

export type ResultadoCanalGarantia = "enviado" | "desligado" | "falhou";

// Carimbo de "alerta processado" do cron: grava se algum canal entregou ou se não havia nada a entregar
// (todos desligados); NÃO grava se todos os canais ligados falharam (tenta de novo na próxima execução).
export function deveCarimbarGarantia(resultados: readonly ResultadoCanalGarantia[]): boolean {
  if (resultados.some((r) => r === "enviado")) return true;
  return resultados.every((r) => r === "desligado");
}
