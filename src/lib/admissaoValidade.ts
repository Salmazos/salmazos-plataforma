// Validade do link público de admissão (admissoes.token / token_expira_em) e a regra de quando ele pode ser renovado. Funções puras, sem I/O: usadas
// pela criação da admissão, pela rota de renovar o link e pelas telas (lista e detalhe), para nunca divergirem.

// Dias de vida de um link de admissão, contados da criação ou da última renovação.
export const TOKEN_VALIDADE_DIAS = 5;

// Só nesses status o candidato ainda edita pelo link (ver resolveAdmissaoByToken); em qualquer outro o link não faria diferença, então não se renova.
export const STATUS_LINK_RENOVAVEL = ["aguardando_candidato", "em_preenchimento"] as const;

export const linkVencido = (tokenExpiraEm: string, agora: Date = new Date()): boolean => new Date(tokenExpiraEm) < agora;

// Renovar: status ainda editável pelo candidato E link já vencido (um link que ainda vale nunca é trocado: o candidato podia estar usando-o agora).
export const podeRenovarLink = (status: string, tokenExpiraEm: string, agora: Date = new Date()): boolean =>
  (STATUS_LINK_RENOVAVEL as readonly string[]).includes(status) && linkVencido(tokenExpiraEm, agora);
