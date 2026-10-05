// Mesmo corte de limitarMensagemAviso (avisoClienteRegras.ts): este módulo não importa outros (roda no script de
// verificação); o script confere que os dois cortam igual.
const limitarMensagemAviso = (t: string, max = 400) => {
  const texto = t.trim();
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
};

// Aviso INTERNO (sino e popup no painel da Salmazos) quando o CLIENTE aprova ou reprova um candidato no portal.
// Módulo puro (sem servidor): usado na rota, na API do popup, no componente e no script de verificação.

export type DecisaoCliente = "aprovado" | "reprovado";

// Eventos de Configurações > Avisos (grupo Portal do cliente) que já existiam só com o canal e-mail.
export const EVENTO_POR_DECISAO: Record<DecisaoCliente, string> = {
  aprovado: "portal_candidato_aprovado",
  reprovado: "portal_candidato_reprovado",
};

// `notificacoes_analista.tipo` de cada decisão (já eram estes antes; o histórico e o sino seguem iguais).
export const TIPO_NOTIFICACAO_POR_DECISAO: Record<DecisaoCliente, string> = {
  aprovado: "aprovacao_cliente",
  reprovado: "reprovacao_cliente",
};
export const TIPOS_NOTIFICACAO_DECISAO: readonly string[] = Object.values(TIPO_NOTIFICACAO_POR_DECISAO);
// Popup interno de avisos nominais: cada `notificacoes_analista.tipo` que ele lista e o evento cujo canal popup
// (Configurações > Avisos) o liga ou desliga. Além das decisões do cliente, a garantia R&S usa o mesmo popup
// (cópia dos valores de garantiaRS.ts, que este módulo não importa; o script confere que coincidem).
export const EVENTO_POR_TIPO_NOTIFICACAO: Record<string, string> = {
  aprovacao_cliente: EVENTO_POR_DECISAO.aprovado,
  reprovacao_cliente: EVENTO_POR_DECISAO.reprovado,
  alerta_garantia_rs: "garantia_rs_vencendo",
  garantia_acionada: "garantia_rs_acionada",
};
export const TIPOS_NOTIFICACAO_POPUP: readonly string[] = Object.keys(EVENTO_POR_TIPO_NOTIFICACAO);

// Sino: sem linha de canal ou erro de leitura = LIGADO (era assim antes do interruptor); só ativo === false desliga.
export function sinoDecisaoLigado(r: { linha: { ativo: boolean | null } | null | undefined; erro: boolean }): boolean {
  if (r.erro) return true;
  return r.linha?.ativo !== false;
}

// Popup: sem linha de canal ou erro de leitura = NÃO mostrar (o popup é novo e só existe com o canal ligado).
export function popupDecisaoLigado(r: { linha: { ativo: boolean | null } | null | undefined; erro: boolean }): boolean {
  if (r.erro) return false;
  return r.linha?.ativo === true;
}

// Texto do aviso. Só nome do cliente, do candidato, título da vaga e o que o cliente escreveu (feedback_cliente:
// comentário na aprovação, motivo na reprovação). Nunca fee, dados de admissão, notas internas nem quem decidiu
// por dentro. Dado nulo só encurta a frase. A mensagem inteira é resumida por limitarMensagemAviso.
export function textoAvisoDecisaoCliente(o: {
  decisao: DecisaoCliente;
  cliente?: string | null;
  candidato?: string | null;
  vagaTitulo?: string | null;
  feedback?: string | null;
}): { titulo: string; mensagem: string } {
  const cliente = o.cliente?.trim() || "Cliente";
  const candidato = o.candidato?.trim() || "Candidato";
  const vaga = o.vagaTitulo?.trim();
  const feedback = o.feedback?.trim();
  const aprovou = o.decisao === "aprovado";
  const base = `${cliente} ${aprovou ? "aprovou" : "reprovou"} a candidatura de ${candidato}${vaga ? ` para a vaga ${vaga}` : ""}`;
  const extra = feedback ? ` — ${aprovou ? "Comentário do cliente" : "Motivo"}: ${feedback}` : "";
  return {
    titulo: aprovou ? "Candidato aprovado pelo cliente" : "Candidato reprovado pelo cliente",
    mensagem: limitarMensagemAviso(base + extra),
  };
}

// Quem recebe o sino: o responsável do candidato (sempre, quando tem login ativo) MAIS a lista do canal sino do
// evento. Um user_id por pessoa, sem repetir quem está nos dois. Vazio = quem chama grava a linha geral da
// unidade do cliente (user_id nulo), como era antes.
export function userIdsDestinoDecisao(responsavelUserId: string | null | undefined, lista: readonly string[]): string[] {
  const vistos = new Set<string>();
  const ids: string[] = [];
  for (const id of [responsavelUserId, ...lista]) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  return ids;
}

// Popup: só avisos NOMINAIS do próprio usuário dos últimos 30 dias que ele ainda não viu. Esconder, nunca apagar.
export const DIAS_JANELA_POPUP_DECISAO = 30;
export function inicioJanelaPopupDecisao(agora: Date = new Date()): string {
  return new Date(agora.getTime() - DIAS_JANELA_POPUP_DECISAO * 24 * 60 * 60 * 1000).toISOString();
}

// Quais tipos de aviso o popup mostra, dados os eventos que estão com o canal popup ligado.
export function tiposComPopupLigado(eventosLigados: readonly string[]): string[] {
  return TIPOS_NOTIFICACAO_POPUP.filter((tipo) => eventosLigados.includes(EVENTO_POR_TIPO_NOTIFICACAO[tipo]));
}

export interface DecisaoPopupItem {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  candidatoId: string | null;
  createdAt: string;
}
