export type ContratoMotFaixa =
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
export function calcularDiasContratoMot(dataAdmissao: string | null): number | null {
  if (!dataAdmissao) return null;
  const [ano, mes, dia] = dataAdmissao.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, dia));
  const diffMs = hojeUTC().getTime() - inicio.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

export function calcularFaixaContratoMot(dias: number): ContratoMotFaixa {
  if (dias <= LIMITE_RENOVACAO_AUTOMATICA) return "renovacao_automatica";
  if (dias <= LIMITE_APROVACAO_CONTINUIDADE) return "aprovacao_continuidade";
  if (dias <= LIMITE_LEGAL_MAXIMO) return "proximo_limite";
  return "limite_excedido";
}

export const CONTRATO_MOT_FAIXA_INFO: Record<ContratoMotFaixa, { bg: string; text: string; sufixo: string }> = {
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
  const limite =
    faixa === "renovacao_automatica"
      ? LIMITE_RENOVACAO_AUTOMATICA
      : faixa === "aprovacao_continuidade"
        ? LIMITE_APROVACAO_CONTINUIDADE
        : faixa === "proximo_limite"
          ? LIMITE_LEGAL_MAXIMO
          : null;
  const label = limite !== null ? `Dia ${dias}/${limite} — ${info.sufixo}` : `Dia ${dias} — ${info.sufixo} (270)`;

  return { dias, faixa, label, bg: info.bg, text: info.text };
}
