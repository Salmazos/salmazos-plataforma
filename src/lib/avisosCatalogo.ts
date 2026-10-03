// Catálogo dos avisos configuráveis em Configurações > Avisos (Fase 1: vagas, rescisão, ASO).
// Módulo puro: usado no client, no server e no script de verificação.

export type GrupoAviso = "vagas" | "rescisao" | "aso";

export const EVENTOS_POR_GRUPO: Record<GrupoAviso, string[]> = {
  vagas: ["vaga_criada", "vaga_reativada", "vaga_fechada", "vaga_cancelada", "solicitacao_vaga"],
  rescisao: ["rescisao_lancamento", "rescisao_vencimento_rescisao", "rescisao_vencimento_guia"],
  aso: ["aso_periodico_sem_registro", "aso_periodico_vencendo", "aso_periodico_atrasado"],
};

export const ROTULO_GRUPO: Record<GrupoAviso, string> = {
  vagas: "Vagas",
  rescisao: "Rescisão",
  aso: "ASO periódico",
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
  aso_periodico_sem_registro: "ASO periódico sem registro",
  aso_periodico_vencendo: "ASO periódico vencendo",
  aso_periodico_atrasado: "ASO periódico em atraso",
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
export function descricaoPadraoDoSistema(grupo: GrupoAviso, canal: string): string {
  if (grupo === "vagas") {
    return canal === "email"
      ? "Padrão do sistema: todos os analistas da unidade recebem."
      : "Padrão do sistema: aviso geral no sino para os analistas da unidade.";
  }
  return "Sem destinatários: ninguém recebe.";
}
