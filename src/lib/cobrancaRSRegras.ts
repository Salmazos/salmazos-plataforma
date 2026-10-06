// Regras puras dos avisos da Cobrança R&S (sem imports: o script de verificação carrega este arquivo direto com
// node --experimental-strip-types; os aliases "@/..." não funcionam lá).

export const EVENTO_COBRANCA_RS_GERADA = "cobranca_rs_gerada";
export const EVENTO_COBRANCA_RS_VALIDADA = "cobranca_rs_validada";
export const EVENTO_COBRANCA_RS_PAGA = "cobranca_rs_paga";
export const EVENTO_COBRANCA_RS_CANCELADA = "cobranca_rs_cancelada";
export const EVENTO_COBRANCA_RS_ATRASADA = "cobranca_rs_atrasada";

export const EVENTOS_COBRANCA_RS = [
  EVENTO_COBRANCA_RS_GERADA,
  EVENTO_COBRANCA_RS_VALIDADA,
  EVENTO_COBRANCA_RS_PAGA,
  EVENTO_COBRANCA_RS_CANCELADA,
  EVENTO_COBRANCA_RS_ATRASADA,
] as const;

// Tipos gravados em email_logs e em notificacoes_analista: NÃO mudam (o aviso de aprovação e o de reenvio compartilham
// o tipo "cobranca_rs_gerada", como sempre).
export const TIPO_EMAIL_COBRANCA_GERADA = "cobranca_rs_gerada";
export const TIPO_EMAIL_COBRANCA_VALIDADA = "cobranca_rs_validada_diretoria";
export const TIPO_EMAIL_COBRANCA_PAGA = "cobranca_rs_paga";
export const TIPO_EMAIL_COBRANCA_CANCELADA = "cobranca_rs_cancelada";
export const TIPO_COBRANCA_ATRASADA = "cobranca_rs_atrasada";

// O lembrete de atraso repete a cada 2 dias até a cobrança ser paga, sem limite de vezes.
export const DIAS_COOLDOWN_ATRASO_COBRANCA = 2;

// "Hoje" em Brasília (sem horário de verão desde 2019). Formato AAAA-MM-DD.
export function dataBrasilia(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Início do dia de Brasília (ISO com offset), para a guarda "já gravei o sino hoje".
export function inicioDiaBrasilia(agora: Date = new Date()): string {
  return `${dataBrasilia(agora)}T00:00:00-03:00`;
}

// Corte do cooldown: lembrete só volta a sair se o último foi há 2 dias ou mais (instante exato, como sempre foi).
export function corteLembreteAtraso(agora: Date = new Date()): string {
  return new Date(agora.getTime() - DIAS_COOLDOWN_ATRASO_COBRANCA * 24 * 60 * 60 * 1000).toISOString();
}

// Dias de atraso por data de calendário em Brasília: hoje (Brasília) menos o vencimento (AAAA-MM-DD). Às 06:00 de Brasília
// (hora do cron) dá o mesmo número que a conta antiga em UTC; a diferença é só se o cron rodar entre 00:00 e 03:00 UTC.
export function diasDeAtraso(vencimentoISO: string, hojeISO: string): number {
  const [vy, vm, vd] = vencimentoISO.split("-").map(Number);
  const [hy, hm, hd] = hojeISO.split("-").map(Number);
  return Math.round((Date.UTC(hy, hm - 1, hd) - Date.UTC(vy, vm - 1, vd)) / 86_400_000);
}

const formatarDataBR = (iso: string): string => iso.split("-").reverse().join("/");

// Sino do atraso: o texto de sempre (cliente, vaga e vencimento; nada de fee, valor, CNPJ ou dado bancário).
export function textoSinoAtrasoCobranca(o: { diasAtraso: number; cliente: string; vaga: string; vencimentoISO: string }): {
  titulo: string;
  mensagem: string;
} {
  return {
    titulo: `🔴 Cobrança R&S atrasada há ${o.diasAtraso} dia${o.diasAtraso !== 1 ? "s" : ""}`,
    mensagem: `${o.cliente} — ${o.vaga} — vencida em ${formatarDataBR(o.vencimentoISO)}, ainda não paga.`,
  };
}

export interface PerfilAnalistaCobranca {
  user_id: string | null;
  email: string | null;
  nome_completo: string | null;
  nivel_acesso: string | null;
}

export interface DestinatarioCobranca {
  user_id: string;
  email: string;
  nome_completo: string;
}

// "Cobrança paga": legado = SÓ o revisor DESTA cobrança (cobrancas_rs.revisado_por, que guarda o user_id), e só se ele NÃO
// for diretoria nem superuser (comparado por nivel_acesso, não por e-mail). Revisor da diretoria/superuser, sem revisor
// ou sem login/e-mail = ninguém. `perfis` são os analistas ATIVOS. Equivale ao que o código antigo fazia ao excluir os
// 4 e-mails da diretoria/superuser e incluir sempre o revisor.
export function destinatariosPagaLegado(perfis: readonly PerfilAnalistaCobranca[], revisadoPor: string | null | undefined): DestinatarioCobranca[] {
  if (!revisadoPor) return [];
  const out = new Map<string, DestinatarioCobranca>();
  for (const a of perfis) {
    if (!a.user_id || !a.email) continue;
    if (a.user_id !== revisadoPor) continue;
    if (a.nivel_acesso === "diretoria" || a.nivel_acesso === "superuser") continue;
    out.set(a.user_id, { user_id: a.user_id, email: a.email, nome_completo: a.nome_completo ?? "" });
  }
  return [...out.values()];
}
