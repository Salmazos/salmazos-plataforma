// Regras puras dos avisos da Cobrança R&S (sem imports: o script de verificação carrega este arquivo direto com
// node --experimental-strip-types; os aliases "@/..." não funcionam lá).

export const EVENTO_COBRANCA_RS_GERADA = "cobranca_rs_gerada";
export const EVENTO_COBRANCA_RS_VALIDADA = "cobranca_rs_validada";
export const EVENTO_COBRANCA_RS_PAGA = "cobranca_rs_paga";
export const EVENTO_COBRANCA_RS_CANCELADA = "cobranca_rs_cancelada";
export const EVENTO_COBRANCA_RS_ATRASADA = "cobranca_rs_atrasada";
// Rascunho recém-criado (status pendente_revisao): só sino. Cobrança parada em "Aguardando validação"
// (aprovada_enviada sem vencimento): sino e e-mail, lembrete do cron lembrete-cobranca-atraso.
export const EVENTO_COBRANCA_RS_PENDENTE_REVISAO = "cobranca_rs_pendente_revisao";
export const EVENTO_COBRANCA_RS_AGUARDANDO_VALIDACAO = "cobranca_rs_aguardando_validacao";

export const EVENTOS_COBRANCA_RS = [
  EVENTO_COBRANCA_RS_GERADA,
  EVENTO_COBRANCA_RS_VALIDADA,
  EVENTO_COBRANCA_RS_PAGA,
  EVENTO_COBRANCA_RS_CANCELADA,
  EVENTO_COBRANCA_RS_ATRASADA,
  EVENTO_COBRANCA_RS_PENDENTE_REVISAO,
  EVENTO_COBRANCA_RS_AGUARDANDO_VALIDACAO,
] as const;

// Tipos gravados em email_logs e em notificacoes_analista: NÃO mudam (o aviso de aprovação e o de reenvio compartilham
// o tipo "cobranca_rs_gerada", como sempre).
export const TIPO_EMAIL_COBRANCA_GERADA = "cobranca_rs_gerada";
export const TIPO_EMAIL_COBRANCA_VALIDADA = "cobranca_rs_validada_diretoria";
export const TIPO_EMAIL_COBRANCA_PAGA = "cobranca_rs_paga";
export const TIPO_EMAIL_COBRANCA_CANCELADA = "cobranca_rs_cancelada";
export const TIPO_COBRANCA_ATRASADA = "cobranca_rs_atrasada";
export const TIPO_COBRANCA_PENDENTE_REVISAO = "cobranca_rs_pendente_revisao";
// Tipo do sino E do e-mail (email_logs) do lembrete de cobrança parada em "Aguardando validação".
export const TIPO_COBRANCA_AGUARDANDO_VALIDACAO = "cobranca_rs_aguardando_validacao";

// O lembrete de atraso repete a cada 2 dias até a cobrança ser paga, sem limite de vezes.
export const DIAS_COOLDOWN_ATRASO_COBRANCA = 2;
// Lembrete de "Aguardando validação": só começa depois de 2 dias desde o envio e repete a cada 2 dias, sem limite, até a
// diretoria definir o vencimento (validar) ou a cobrança ser cancelada.
export const DIAS_ESPERA_VALIDACAO = 2;
export const DIAS_COOLDOWN_VALIDACAO = 2;

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

export function somarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Instante (ISO em UTC) do início do dia de Brasília que fica `dias - 1` dias antes de `hojeISO`. Um instante ANTERIOR a ele cai
// em dia de calendário <= hoje - dias (em Brasília): "há pelo menos `dias` dias". Por data, não por 48 horas exatas: o cron roda
// todo dia na mesma hora e uma diferença de segundos entre execuções não pode empurrar o lembrete para o dia seguinte.
export function limiteDiasBrasilia(hojeISO: string, dias: number): string {
  return new Date(`${somarDiasISO(hojeISO, -(dias - 1))}T00:00:00-03:00`).toISOString();
}
export const limiteEnvioValidacao = (hojeISO: string): string => limiteDiasBrasilia(hojeISO, DIAS_ESPERA_VALIDACAO);
export const limiteCooldownValidacao = (hojeISO: string): string => limiteDiasBrasilia(hojeISO, DIAS_COOLDOWN_VALIDACAO);

// Dias (de calendário, em Brasília) entre o instante informado (timestamptz ISO) e hoje.
export function diasParadoDesde(instanteISO: string, hojeISO: string): number {
  return diasDeAtraso(dataBrasilia(new Date(instanteISO)), hojeISO);
}

// A coluna cobrancas_rs.ultimo_lembrete_validacao_em vem da migration migration_avisos_cobranca_pendencias.sql. Antes de ela ser
// aplicada o Postgres responde 42703 (coluna inexistente) e o bloco novo do cron é pulado. Só 42703 ou uma mensagem que cita a
// coluna contam: qualquer outro erro NÃO é "coluna ausente".
export function ehErroColunaLembreteValidacao(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || /ultimo_lembrete_validacao_em/.test(String(err.message ?? ""));
}

// Sino do rascunho recém-criado. Sem valor, fee, CNPJ ou salário: só cliente, vaga e (contratação) o candidato.
export function textoSinoPendenteRevisao(o: { tipo: "contratacao" | "cancelamento"; cliente: string; vaga: string; candidato?: string | null }): {
  titulo: string;
  mensagem: string;
} {
  const detalhe = o.tipo === "cancelamento" ? "taxa de cancelamento" : `candidato ${o.candidato?.trim() || "—"}`;
  return {
    titulo: "🟡 Cobrança R&S pendente de revisão",
    mensagem: `${o.cliente} — ${o.vaga} — ${detalhe}: rascunho aguardando revisão.`,
  };
}

// Sino do lembrete de cobrança parada em "Aguardando validação" (sem valor, fee, CNPJ nem salário).
export function textoSinoAguardandoValidacao(o: { dias: number; tipo: "contratacao" | "cancelamento"; cliente: string; vaga: string; candidato?: string | null }): {
  titulo: string;
  mensagem: string;
} {
  const detalhe = o.tipo === "cancelamento" ? "taxa de cancelamento" : `candidato ${o.candidato?.trim() || "—"}`;
  return {
    titulo: `🟠 Cobrança R&S aguardando validação há ${o.dias} dia${o.dias !== 1 ? "s" : ""}`,
    mensagem: `${o.cliente} — ${o.vaga} — ${detalhe}: enviada para validação e ainda sem vencimento definido.`,
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

export interface PerfilComAcessoCobranca extends PerfilAnalistaCobranca {
  id: string;
}

// Quem pode revisar/validar cobranças: diretoria e superuser (nivel_acesso) + os analistas com linha ativa em
// cobranca_rs_analistas_acesso (`acessoPerfilIds` = analista_perfil_id). `perfis` são os analistas ATIVOS; quem não tem login
// (user_id) ou e-mail fica de fora, como em obterDestinatariosCobrancaRS.
//   excluirUserId: tira essa pessoa (o gerador, que já cai no modal de revisão ao contratar) — nulo não exclui ninguém.
//   incluirUserId: soma essa pessoa mesmo sem acesso amplo (o gerador pode revisar e definir o vencimento da PRÓPRIA cobrança,
//                  como podeRevisarCobranca).
export function destinatariosComAcessoCobranca(
  perfis: readonly PerfilComAcessoCobranca[],
  acessoPerfilIds: ReadonlySet<string>,
  opcoes: { excluirUserId?: string | null; incluirUserId?: string | null } = {}
): DestinatarioCobranca[] {
  const out = new Map<string, DestinatarioCobranca>();
  for (const a of perfis) {
    if (!a.user_id || !a.email) continue;
    if (opcoes.excluirUserId && a.user_id === opcoes.excluirUserId) continue;
    const ehDiretoria = a.nivel_acesso === "diretoria" || a.nivel_acesso === "superuser";
    const ehIncluido = !!opcoes.incluirUserId && a.user_id === opcoes.incluirUserId;
    if (ehDiretoria || acessoPerfilIds.has(a.id) || ehIncluido) {
      out.set(a.user_id, { user_id: a.user_id, email: a.email, nome_completo: a.nome_completo ?? "" });
    }
  }
  return [...out.values()];
}
