// Regras puras de Propostas (Comercial): modelos, situações, transições, validade, numeração e efeito no Funil.
// Módulo sem imports de servidor: usado no client e no server.

export const MODELOS = ["RS", "MOT", "TS"] as const;
export type ModeloProposta = (typeof MODELOS)[number];
// Só o R&S tem texto e PDF na Fase 1; MOT e TS já existem no banco (CHECK e contador) e aparecem como "Em breve".
export const MODELOS_ATIVOS: ModeloProposta[] = ["RS"];

export const ROTULO_MODELO: Record<ModeloProposta, string> = {
  RS: "Recrutamento & Seleção",
  MOT: "Mão de Obra Temporária",
  TS: "Terceirização de Serviços",
};

export function modeloDisponivel(modelo: string): modelo is ModeloProposta {
  return (MODELOS_ATIVOS as string[]).includes(modelo);
}

export const SITUACOES = ["rascunho", "enviada", "em_negociacao", "aceita", "recusada", "vencida", "cancelada"] as const;
export type SituacaoProposta = (typeof SITUACOES)[number];

export const ROTULO_SITUACAO: Record<SituacaoProposta, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceita: "Aceita",
  recusada: "Recusada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

export const TRANSICOES: Record<SituacaoProposta, SituacaoProposta[]> = {
  rascunho: ["enviada", "cancelada"],
  enviada: ["em_negociacao", "aceita", "recusada", "vencida", "cancelada"],
  em_negociacao: ["aceita", "recusada", "vencida", "cancelada"],
  aceita: [],
  recusada: [],
  vencida: [],
  cancelada: [],
};

export function podeTransicionar(de: SituacaoProposta, para: SituacaoProposta): boolean {
  return TRANSICOES[de].includes(para);
}

export function ehFinal(situacao: SituacaoProposta): boolean {
  return TRANSICOES[situacao].length === 0;
}

// "Vencida" é sempre automática (varredura por validade): o vendedor nunca a escolhe.
export const SITUACOES_ESCOLHIDAS_PELO_VENDEDOR: SituacaoProposta[] = ["enviada", "em_negociacao", "aceita", "recusada", "cancelada"];

// Rascunho se edita no lugar; proposta já entregue (enviada/em negociação) gera uma nova revisão; as demais não editam.
export function modoEdicao(situacao: SituacaoProposta): "rascunho" | "revisao" | null {
  if (situacao === "rascunho") return "rascunho";
  if (situacao === "enviada" || situacao === "em_negociacao") return "revisao";
  return null;
}

// ── Prazos ───────────────────────────────────────────────────────────────────

export const VALIDADE_PADRAO_DIAS = 15;
export const VALIDADE_MIN_DIAS = 1;
export const VALIDADE_MAX_DIAS = 90;
export const FOLLOWUP_DIAS_UTEIS = 3;

function somarDiasCorridos(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Só segunda a sexta; feriados não entram. Domingo e sábado nunca contam como dia útil.
export function somarDiasUteis(dataIso: string, dias: number): string {
  if (!Number.isInteger(dias) || dias < 0) throw new Error("somarDiasUteis: dias deve ser inteiro >= 0");
  let atual = dataIso;
  let restantes = dias;
  while (restantes > 0) {
    atual = somarDiasCorridos(atual, 1);
    const diaSemana = new Date(`${atual}T12:00:00Z`).getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes -= 1;
  }
  return atual;
}

export function calcularValidadeAte(emissaoIso: string, validadeDias: number): string {
  return somarDiasCorridos(emissaoIso, validadeDias);
}

export function diasRestantes(validadeAte: string, hojeIso: string): number {
  const ms = new Date(`${validadeAte}T12:00:00Z`).getTime() - new Date(`${hojeIso}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

// Vence no dia seguinte ao último dia de validade; só proposta aberta (enviada/em negociação) vence.
export function deveVencer(situacao: SituacaoProposta, validadeAte: string | null, hojeIso: string): boolean {
  return (situacao === "enviada" || situacao === "em_negociacao") && !!validadeAte && validadeAte < hojeIso;
}

// ── Numeração (a oficial vem de criar_proposta no banco; estas funções só formatam/exibem) ────

export function formatarNumeroProposta(modelo: ModeloProposta, ano: number, sequencial: number): string {
  return `${modelo}-${String(sequencial).padStart(4, "0")}/${String(ano % 100).padStart(2, "0")}`;
}

export function numeroComRevisao(numero: string, revisao: number): string {
  return revisao > 0 ? `${numero} – Rev. ${revisao}` : numero;
}

// ── Efeito no Funil ──────────────────────────────────────────────────────────

export type EtapaFunilDaProposta = "proposta_enviada" | "negociacao" | "ganho" | "perdido";

const ETAPAS_ANTES_DA_PROPOSTA = ["prospeccao", "contato_feito", "reuniao_visita"];

// Etapa para a qual a oportunidade deve ir quando a proposta muda de situação (null = não mexe).
// Nunca volta a oportunidade para uma fase anterior; Vencida e Cancelada não mexem no Funil.
export function etapaAposSituacao(para: SituacaoProposta, etapaAtual: string): EtapaFunilDaProposta | null {
  if (etapaAtual === "ganho" || etapaAtual === "perdido") return null;
  switch (para) {
    case "enviada":
      return ETAPAS_ANTES_DA_PROPOSTA.includes(etapaAtual) ? "proposta_enviada" : null;
    case "em_negociacao":
      return etapaAtual === "proposta_enviada" ? "negociacao" : null;
    case "aceita":
      return "ganho";
    case "recusada":
      return "perdido";
    default:
      return null;
  }
}

export const SERVICO_POR_MODELO: Record<ModeloProposta, string> = {
  RS: "Recrutamento e Seleção",
  MOT: "Mão de Obra Temporária",
  TS: "Terceirização de Serviços",
};

// O número vai no texto: é por ele (junto com oportunidade_id e tipo "retorno") que o lembrete é cancelado depois.
export function textoFollowUp(numero: string): string {
  return `Follow-up da proposta ${numero}`;
}
