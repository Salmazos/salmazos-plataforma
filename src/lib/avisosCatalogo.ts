// Catálogo dos avisos configuráveis em Configurações > Avisos (Fase 1: vagas, rescisão, ASO).
// Módulo puro: usado no client, no server e no script de verificação.

export type GrupoAviso = "vagas" | "rescisao" | "aso" | "portal_cliente";

export const EVENTOS_POR_GRUPO: Record<GrupoAviso, string[]> = {
  vagas: ["vaga_criada", "vaga_reativada", "vaga_fechada", "vaga_cancelada", "solicitacao_vaga"],
  rescisao: ["rescisao_lancamento", "rescisao_vencimento_rescisao", "rescisao_vencimento_guia", "rescisao_paga"],
  aso: ["aso_periodico_sem_registro", "aso_periodico_vencendo", "aso_periodico_atrasado"],
  portal_cliente: ["portal_candidato_aprovado", "portal_candidato_reprovado", "indicacao_decisao_cliente"],
};

export const ROTULO_GRUPO: Record<GrupoAviso, string> = {
  vagas: "Vagas",
  rescisao: "Rescisão",
  aso: "ASO periódico",
  portal_cliente: "Portal do cliente",
};

export const ROTULO_EVENTO: Record<string, string> = {
  vaga_criada: "Nova vaga criada",
  vaga_reativada: "Vaga reativada",
  vaga_fechada: "Vaga fechada",
  vaga_cancelada: "Vaga cancelada",
  solicitacao_vaga: "Solicitação de vaga (cliente)",
  rescisao_lancamento: "Rescisão lançada",
  rescisao_vencimento_rescisao: "Pagamento de rescisão vence hoje",
  rescisao_vencimento_guia: "Pagamento de guia vence hoje",
  rescisao_paga: "Rescisão paga",
  aso_periodico_sem_registro: "ASO periódico sem registro",
  aso_periodico_vencendo: "ASO periódico vencendo",
  aso_periodico_atrasado: "ASO periódico em atraso",
  portal_candidato_aprovado: "Cliente aprovou candidato (portal)",
  portal_candidato_reprovado: "Cliente reprovou candidato (portal)",
  indicacao_decisao_cliente: "Indicação direta aprovada pela Salmazos",
};

// Canais que cada aviso realmente tem hoje (espelha aviso_eventos.canais_suportados). O que não
// está aqui suporta e-mail e sino.
export const CANAIS_POR_EVENTO: Record<string, readonly ("email" | "sino")[]> = {
  rescisao_paga: ["sino"],
  portal_candidato_aprovado: ["email"],
  portal_candidato_reprovado: ["email"],
  indicacao_decisao_cliente: ["email"],
};

export function canaisDoEvento(evento: string): readonly ("email" | "sino")[] {
  return CANAIS_POR_EVENTO[evento] ?? CANAIS_FASE1;
}

// Explicações mostradas na tela, onde o aviso foge do padrão "lista por canal".
export const NOTA_EVENTO: Record<string, string> = {
  rescisao_paga: "Hoje este aviso só existe no sino (e no popup de login, que deriva dele).",
  portal_candidato_aprovado:
    "O sino desta aprovação continua indo para o responsável pelo candidato (regra fixa, não é lista) — por isso só o e-mail é configurável.",
  portal_candidato_reprovado:
    "Hoje não existe e-mail interno de reprovação (o sino vai para o responsável pelo candidato, regra fixa). Vem desligado: ao ligar, os destinatários abaixo passam a receber um e-mail a cada reprovação feita pelo cliente.",
  indicacao_decisao_cliente:
    "E-mail enviado quando a Salmazos aprova uma indicação direta do cliente (traz os dados de admissão). Não há sino neste aviso.",
};

export const CANAIS_FASE1 = ["email", "sino"] as const;
export type CanalFase1 = (typeof CANAIS_FASE1)[number];
export const ROTULO_CANAL: Record<string, string> = { email: "E-mail", sino: "Sino" };

export function grupoDoEvento(evento: string): GrupoAviso | null {
  for (const g of Object.keys(EVENTOS_POR_GRUPO) as GrupoAviso[]) {
    if (EVENTOS_POR_GRUPO[g].includes(evento)) return g;
  }
  return null;
}

// O que significa "sem destinatários na lista" (modo legado) em cada grupo — mostrado na tela.
export function descricaoPadraoDoSistema(grupo: GrupoAviso, canal: string, evento = ""): string {
  if (grupo === "portal_cliente") {
    return evento === "portal_candidato_reprovado"
      ? "Sem destinatários: ninguém recebe."
      : "Padrão do sistema: Olver e RH (olver@ e rh@) recebem.";
  }
  if (grupo === "vagas") {
    return canal === "email"
      ? "Padrão do sistema: todos os analistas da unidade recebem."
      : "Padrão do sistema: aviso geral no sino para os analistas da unidade.";
  }
  return "Sem destinatários: ninguém recebe.";
}
