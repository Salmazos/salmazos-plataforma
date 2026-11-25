// Regras puras de Propostas (Comercial): modelos, situações, transições, validade, numeração e efeito no Funil.
// Módulo sem imports de servidor: usado no client e no server.

export const MODELOS = ["RS", "MOT", "TS"] as const;
export type ModeloProposta = (typeof MODELOS)[number];
// Só o R&S tem texto e PDF na Fase 1; MOT e TS já existem no banco (CHECK; a numeração real é UMA sequência por ano para as 3 modalidades, ver
// supabase/migration_propostas_contador_unico.sql) e aparecem como "Em breve".
export const MODELOS_ATIVOS: ModeloProposta[] = ["RS"];

export const ROTULO_MODELO: Record<ModeloProposta, string> = {
  RS: "Recrutamento & Seleção",
  MOT: "Mão de Obra Temporária",
  TS: "Terceirização de Serviços",
};

// Chave SÓ DO HARNESS para exercitar o MOT antes da tela e do PDF (etapas 2D/2E). Em produção o MOT continua desligado (MODELOS_ATIVOS = ["RS"]): a chave
// só vale fora de produção (NODE_ENV e VERCEL_ENV), então uma variável esquecida no painel da Vercel NUNCA liga o MOT.
export const CHAVE_HARNESS_MOT = "HARNESS_PROPOSTA_MOT";
export function chaveHarnessMotLigada(): boolean {
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (!env) return false;
  return env[CHAVE_HARNESS_MOT] === "1" && env.NODE_ENV !== "production" && !env.VERCEL_ENV && !env.VERCEL;
}

// Trava do MOT (enquanto o PDF não está aprovado): além da chave do harness (só fora de produção), o MOT só vale para o GESTOR e em empresa de TESTE.
// Sem o 2º argumento o comportamento é o de sempre (R&S ativo; MOT só pela chave do harness). Vendedor nunca cria MOT; proposta MOT real é impossível.
export interface ContextoModelo {
  gestor?: boolean;
  teste?: boolean;
}
export function modeloDisponivel(modelo: string, ctx?: ContextoModelo): modelo is ModeloProposta {
  if ((MODELOS_ATIVOS as string[]).includes(modelo)) return true;
  if (modelo !== "MOT") return false;
  if (chaveHarnessMotLigada()) return true;
  return ctx?.gestor === true && ctx?.teste === true;
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

export function formatarNumeroProposta(sigla: string, ano: number, sequencial: number): string {
  return `${sigla}-${String(sequencial).padStart(4, "0")}/${String(ano % 100).padStart(2, "0")}`;
}

export const MSG_NOME_INCOMPLETO = "Complete seu nome no perfil para criar propostas.";
const PARTICULAS_NOME = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

// Sigla do número da proposta: 1ª letra da primeira palavra + 1ª letra da última, sem de/da/do/das/dos/e, sem acento, só A-Z
// (Olver Pereira dos Santos → OS). Nome de uma palavra: as 2 primeiras letras (Ölver → OL). Sem letras aproveitáveis: null
// (quem chama recusa, em vez de inventar uma sigla).
export function siglaDoVendedor(nome: string | null | undefined): string | null {
  const palavras = (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Z]/g, ""))
    .filter((p) => p !== "" && !PARTICULAS_NOME.has(p));
  if (palavras.length === 0) return null;
  if (palavras.length === 1) return palavras[0].slice(0, 2);
  return palavras[0][0] + palavras[palavras.length - 1][0];
}

// A assinatura só mostra e-mail da empresa: o e-mail do perfil é o de login e pode ser pessoal.
const EMAIL_CORPORATIVO = /^[^\s@]+@salmazos\.com\.br$/i;
export function emailParaAssinatura(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  return EMAIL_CORPORATIVO.test(e) ? e : null;
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
