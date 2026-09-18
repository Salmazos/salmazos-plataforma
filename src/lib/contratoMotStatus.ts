export type ContratoMotFaixa =
  | "data_futura"
  | "renovacao_automatica"
  | "aprovacao_continuidade"
  | "proximo_limite"
  | "limite_excedido";

// Regra de negócio pro contador de contrato MOT (mão de obra temporária, Lei 6.019/74):
// até 90 dias a renovação é automática; de 91 a 180 dias passa a exigir uma aprovação
// simples de continuidade; de 181 a 270 dias já está próximo do limite; acima de 270 dias
// o contrato já excedeu o máximo legal permitido. Só se aplica a funcionários MOT
// (tipo_servico = "mao_obra_temporaria") — Terceirização e R&S não têm esse limite.
const LIMITE_RENOVACAO_AUTOMATICA = 90;
const LIMITE_APROVACAO_CONTINUIDADE = 180;
const LIMITE_LEGAL_MAXIMO = 270;

function hojeUTC(): Date {
  // Mesma técnica de asoStatus.ts — Brasil não observa horário de verão desde 2019, então
  // dá pra pegar "hoje" em -03:00 sem biblioteca de timezone.
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, mes, dia] = hojeSP.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// ASSUNÇÃO ADOTADA NESTA IMPLEMENTAÇÃO (a confirmar com o Olver se necessário): usa-se
// funcionarios.data_admissao como marco inicial da contagem — é o único campo de data
// sempre presente no cadastro do funcionário (manual ou via admissão digital), e já é
// mostrado na tela como "Data de admissão". Se a Salmazos passar a rastrear uma data de
// início de contrato MOT separada da admissão (ex: em renovações formais futuras), este é
// o único ponto a ajustar.
//
// Sem clamp em 0: um resultado negativo (data de admissão no futuro) é sinal de erro de
// cadastro, não "contrato começando hoje" — precisa aparecer como está pra calcularFaixaContratoMot
// decidir o que fazer (ver caso real: dois funcionários cadastrados com data_admissao em
// 2027 por erro de digitação do ano, encontrado em set/2026).
export function calcularDiasContratoMot(dataAdmissao: string | null): number | null {
  if (!dataAdmissao) return null;
  const [ano, mes, dia] = dataAdmissao.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, dia));
  const diffMs = hojeUTC().getTime() - inicio.getTime();
  return Math.floor(diffMs / 86400000);
}

export function calcularFaixaContratoMot(dias: number): ContratoMotFaixa {
  if (dias < 0) return "data_futura";
  if (dias <= LIMITE_RENOVACAO_AUTOMATICA) return "renovacao_automatica";
  if (dias <= LIMITE_APROVACAO_CONTINUIDADE) return "aprovacao_continuidade";
  if (dias <= LIMITE_LEGAL_MAXIMO) return "proximo_limite";
  return "limite_excedido";
}

// Cor roxa pra "data_futura" pelo mesmo motivo de ASO_STATUS_INFO.sem_registro (asoStatus.ts):
// é um problema de CADASTRO (data errada), não um problema de PRAZO — nunca reaproveitar
// vermelho/âmbar/laranja, que aqui significam "prazo avançando", pra não confundir as duas
// categorias de alerta.
export const CONTRATO_MOT_FAIXA_INFO: Record<ContratoMotFaixa, { bg: string; text: string; sufixo: string }> = {
  data_futura: { bg: "#EDE9FE", text: "#5B21B6", sufixo: "data de admissão no futuro — verificar cadastro" },
  renovacao_automatica: { bg: "#EFF6FF", text: "#1D4ED8", sufixo: "renovação automática" },
  aprovacao_continuidade: { bg: "#FEF3C7", text: "#92400E", sufixo: "requer aprovação de continuidade" },
  proximo_limite: { bg: "#FFEDD5", text: "#C2410C", sufixo: "próximo do limite legal" },
  limite_excedido: { bg: "#FEE2E2", text: "#991B1B", sufixo: "limite legal excedido" },
};

// Ponto único usado pela tela de funcionários do painel e pela aba de funcionários do
// Portal do Cliente — mesmo raciocínio do controle de acesso (nunca calcular a mesma regra
// de negócio em dois lugares separados, pra nunca divergir).
export function calcularContadorContratoMot(
  dataAdmissao: string | null
): { dias: number; faixa: ContratoMotFaixa; label: string; bg: string; text: string } | null {
  const dias = calcularDiasContratoMot(dataAdmissao);
  if (dias === null) return null;

  const faixa = calcularFaixaContratoMot(dias);
  const info = CONTRATO_MOT_FAIXA_INFO[faixa];

  let label: string;
  if (faixa === "data_futura") {
    label = info.sufixo.charAt(0).toUpperCase() + info.sufixo.slice(1);
  } else {
    const limite =
      faixa === "renovacao_automatica"
        ? LIMITE_RENOVACAO_AUTOMATICA
        : faixa === "aprovacao_continuidade"
          ? LIMITE_APROVACAO_CONTINUIDADE
          : faixa === "proximo_limite"
            ? LIMITE_LEGAL_MAXIMO
            : null;
    label = limite !== null ? `Dia ${dias}/${limite} — ${info.sufixo}` : `Dia ${dias} — ${info.sufixo} (270)`;
  }

  return { dias, faixa, label, bg: info.bg, text: info.text };
}
