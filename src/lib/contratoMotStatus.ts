export type ContratoMotFaixa =
  | "data_futura"
  | "renovacao_automatica"
  | "aprovacao_continuidade"
  | "proximo_limite"
  | "limite_excedido";

// Regra de negócio do relatório "Vencimento de Contrato" (mão de obra temporária, Lei
// 6.019/74), confirmada com o Olver: até 90 dias corridos desde a admissão a renovação é
// automática (sem ação necessária); de 91 a 180 dias passa a exigir uma aprovação simples
// de continuidade; de 181 a 270 dias já está próximo do limite legal; acima de 270 dias o
// contrato já excedeu o máximo legal permitido. Só se aplica a funcionários MOT
// (tipo_servico = "mao_obra_temporaria") — Terceirização e R&S não têm esse limite.
const DIAS_RENOVACAO_AUTOMATICA = 90;
const DIAS_APROVACAO_CONTINUIDADE = 180;
const DIAS_LIMITE_LEGAL = 270;

// Antecedência do popup de aviso (painel + Portal do Cliente): 10 dias corridos antes de
// um vencimento que exige ação humana — 180 (aprovação de continuidade) e 270 (limite
// legal). O vencimento de 90 dias nunca dispara popup: é automático, avisar não muda nada
// pra ninguém agir.
export const DIAS_ANTECEDENCIA_POPUP = 10;

function hojeUTC(): Date {
  // Mesma técnica usada em asoStatus.ts — Brasil não observa horário de verão desde 2019,
  // então dá pra pegar "hoje" em -03:00 sem biblioteca de timezone.
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, mes, dia] = hojeSP.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function parseDataISO(dataISO: string): Date {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

// "Dias corridos" (calendário, não dias úteis) — pedido explícito do Olver. Soma direto no
// UTC (sem fuso) porque a data de entrada já é um marco de calendário puro (YYYY-MM-DD),
// mesmo raciocínio de calcularDataVencimentoAso em asoStatus.ts.
export function adicionarDiasISO(dataISO: string, dias: number): string {
  const data = parseDataISO(dataISO);
  data.setUTCDate(data.getUTCDate() + dias);
  return formatarDataISO(data);
}

// ASSUNÇÃO ADOTADA NESTA IMPLEMENTAÇÃO (a confirmar com o Olver se necessário): usa-se
// funcionarios.data_admissao como marco inicial da contagem — é o único campo de data
// sempre presente no cadastro do funcionário (manual ou via admissão digital), e já é
// mostrado na tela como "Data de admissão". Se a Salmazos passar a rastrear uma data de
// início de contrato MOT separada da admissão (ex: em renovações formais futuras), este é
// o único ponto a ajustar.
//
// Sem clamp em 0: um resultado negativo (data de admissão no futuro) é sinal de erro de
// cadastro, não "contrato começando hoje" — precisa aparecer como está pra
// calcularFaixaContratoMot decidir o que fazer (ver caso real: dois funcionários
// cadastrados com data_admissao em 2027 por erro de digitação do ano, encontrado em
// set/2026 e corrigido no banco).
export function calcularDiasContratoMot(dataAdmissao: string): number {
  const inicio = parseDataISO(dataAdmissao);
  const diffMs = hojeUTC().getTime() - inicio.getTime();
  return Math.floor(diffMs / 86400000);
}

export function calcularFaixaContratoMot(dias: number): ContratoMotFaixa {
  if (dias < 0) return "data_futura";
  if (dias <= DIAS_RENOVACAO_AUTOMATICA) return "renovacao_automatica";
  if (dias <= DIAS_APROVACAO_CONTINUIDADE) return "aprovacao_continuidade";
  if (dias <= DIAS_LIMITE_LEGAL) return "proximo_limite";
  return "limite_excedido";
}

// Cor roxa pra "data_futura" pelo mesmo motivo de ASO_STATUS_INFO.sem_registro (asoStatus.ts):
// é um problema de CADASTRO (data errada), não um problema de PRAZO — nunca reaproveitar
// vermelho/âmbar/laranja, que aqui significam "prazo avançando", pra não confundir as duas
// categorias de alerta. Cores de faixa de prazo confirmadas com o Olver: verde (até 90),
// âmbar (até 180), laranja (até 270), vermelho (acima de 270).
export const CONTRATO_MOT_FAIXA_INFO: Record<ContratoMotFaixa, { bg: string; text: string; label: string }> = {
  data_futura: { bg: "#EDE9FE", text: "#5B21B6", label: "Data de admissão no futuro — verificar cadastro" },
  renovacao_automatica: { bg: "#EFF6FF", text: "#1D4ED8", label: "Renovação automática" },
  aprovacao_continuidade: { bg: "#FEF3C7", text: "#92400E", label: "Requer aprovação de continuidade" },
  proximo_limite: { bg: "#FFEDD5", text: "#C2410C", label: "Próximo do limite legal" },
  limite_excedido: { bg: "#FEE2E2", text: "#991B1B", label: "Limite legal excedido" },
};

export interface VencimentoContratoMot {
  diasTrabalhados: number;
  vencimento90: string;
  vencimento180: string;
  vencimento270: string;
  faixa: ContratoMotFaixa;
  // Data do próximo marco ainda não alcançado (ou o último, quando já excedido — nesse
  // caso os dias abaixo ficam negativos, o que é o sinal de "já passou").
  proximoVencimento: string;
  diasParaProximoVencimento: number;
  bg: string;
  text: string;
  label: string;
}

// Ponto único usado pelo relatório "Vencimento de Contrato" (painel e Portal do Cliente) e
// pelos dois popups de aviso — mesmo raciocínio do controle de acesso (nunca calcular a
// mesma regra de negócio em dois lugares separados, pra nunca divergir).
export function calcularVencimentoContratoMot(dataAdmissao: string): VencimentoContratoMot {
  const diasTrabalhados = calcularDiasContratoMot(dataAdmissao);
  const faixa = calcularFaixaContratoMot(diasTrabalhados);
  const vencimento90 = adicionarDiasISO(dataAdmissao, DIAS_RENOVACAO_AUTOMATICA);
  const vencimento180 = adicionarDiasISO(dataAdmissao, DIAS_APROVACAO_CONTINUIDADE);
  const vencimento270 = adicionarDiasISO(dataAdmissao, DIAS_LIMITE_LEGAL);

  // "Próximo vencimento" pra ordenação da lista (do mais perto pro mais longe) — enquanto
  // não excedeu, é sempre o próximo marco ainda não alcançado; depois de excedido, fica
  // fixo em 270 (não existe marco seguinte), com dias negativos indicando há quanto tempo
  // passou. Uma data_futura (dias negativo) aponta pro marco de 90 com uma distância bem
  // maior que 90 — cai naturalmente pro fim da lista, longe da urgência real.
  const proximoVencimento =
    faixa === "aprovacao_continuidade" ? vencimento180 : faixa === "proximo_limite" || faixa === "limite_excedido" ? vencimento270 : vencimento90;
  const diasParaProximoVencimento =
    faixa === "aprovacao_continuidade"
      ? DIAS_APROVACAO_CONTINUIDADE - diasTrabalhados
      : faixa === "proximo_limite" || faixa === "limite_excedido"
        ? DIAS_LIMITE_LEGAL - diasTrabalhados
        : DIAS_RENOVACAO_AUTOMATICA - diasTrabalhados;

  const info = CONTRATO_MOT_FAIXA_INFO[faixa];
  return {
    diasTrabalhados,
    vencimento90,
    vencimento180,
    vencimento270,
    faixa,
    proximoVencimento,
    diasParaProximoVencimento,
    bg: info.bg,
    text: info.text,
    label: info.label,
  };
}

// Só dispara popup pros dois vencimentos que exigem ação humana (180 e 270) e só dentro da
// janela de 10 dias de antecedência — ou já excedido (270 pra trás), que fica em aviso
// permanente até ser resolvido (efetivação ou desligamento). O vencimento de 90 dias nunca
// gera popup (renovação automática, sem ação).
export function precisaAvisoPopupVencimentoMot(v: VencimentoContratoMot): boolean {
  if (v.faixa === "limite_excedido") return true;
  if (v.faixa === "aprovacao_continuidade" || v.faixa === "proximo_limite") {
    return v.diasParaProximoVencimento <= DIAS_ANTECEDENCIA_POPUP;
  }
  return false;
}

// Mensagem do popup — usada tanto no painel quanto no Portal do Cliente, pra nunca
// divergir o texto do aviso entre os dois lados.
export function mensagemAvisoPopupVencimentoMot(v: VencimentoContratoMot): string {
  if (v.faixa === "limite_excedido") {
    return `Contrato já excedeu o limite legal de 270 dias há ${Math.abs(v.diasParaProximoVencimento)} dia(s) — ação imediata necessária (efetivação ou desligamento).`;
  }
  if (v.faixa === "proximo_limite") {
    return `Faltam ${v.diasParaProximoVencimento} dia(s) para atingir o limite legal de 270 dias — decisão urgente necessária.`;
  }
  return `Faltam ${v.diasParaProximoVencimento} dia(s) para completar 180 dias de contrato — requer aprovação de continuidade.`;
}
