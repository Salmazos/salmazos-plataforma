// Link público de solicitação de vaga (R&S) para cliente que ainda não tem acesso ao portal.
// Parte PURA e sem imports (usada no navegador, nas rotas e em scripts/verificar-solicitacao-link.mts). A leitura no banco
// fica em solicitacaoVagaLinkServidor.ts.

// Teto de envios por link, aplicado em código sobre solicitacao_vaga_links.usos (o rate limit do middleware é por instância
// e não basta como proteção contra spam).
export const MAX_USOS_LINK = 30;
export const VALIDADES_LINK_DIAS = [7, 15, 30] as const;
export const VALIDADE_LINK_PADRAO_DIAS = 15;

// Uma só mensagem para link inexistente, expirado, revogado ou no limite: o cliente não precisa (nem deve) saber o motivo técnico.
export const MENSAGEM_LINK_INDISPONIVEL =
  "Este link não está mais disponível. Entre em contato com a Salmazos para receber um novo link.";

export type StatusLink = "ativo" | "expirado" | "revogado" | "limite";

export interface LinkParaValidar {
  expira_em: string;
  revogado_em: string | null;
  usos: number;
}

// Prioridade: revogado > expirado > limite atingido.
export function statusDoLink(link: LinkParaValidar, agora: Date): StatusLink {
  if (link.revogado_em) return "revogado";
  if (new Date(link.expira_em).getTime() <= agora.getTime()) return "expirado";
  if (link.usos >= MAX_USOS_LINK) return "limite";
  return "ativo";
}

export type ResultadoValidacaoLink =
  | { ok: true }
  | { ok: false; status: StatusLink | "inexistente"; httpStatus: 404 | 410; mensagem: string };

export function validarLink(link: LinkParaValidar | null | undefined, agora: Date): ResultadoValidacaoLink {
  if (!link) return { ok: false, status: "inexistente", httpStatus: 404, mensagem: MENSAGEM_LINK_INDISPONIVEL };
  const status = statusDoLink(link, agora);
  if (status === "ativo") return { ok: true };
  return { ok: false, status, httpStatus: 410, mensagem: MENSAGEM_LINK_INDISPONIVEL };
}

export function calcularExpiraEm(agora: Date, dias: number): string {
  return new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

export const ROTULO_STATUS_LINK: Record<StatusLink, string> = {
  ativo: "Ativo",
  expirado: "Expirado",
  revogado: "Revogado",
  limite: "Limite atingido",
};
