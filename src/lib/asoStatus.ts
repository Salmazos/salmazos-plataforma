export type AsoStatus = "sem_registro" | "em_dia" | "vencendo" | "atrasado";

const VALIDADE_MESES = 12;
const ANTECEDENCIA_AVISO_DIAS = 30;

// Reusado pela lista de funcionários, pela tela de detalhe, pelo cron de avisos (Fase 3) e
// pelo portal do cliente (Fase 5) — uma única fonte pra "o que significa vencido" nunca
// divergir entre esses pontos.
export function calcularStatusAso(dataExameMaisRecente: string | null): AsoStatus {
  if (!dataExameMaisRecente) return "sem_registro";

  const [ano, mes, dia] = dataExameMaisRecente.split("-").map(Number);
  const vencimento = new Date(Date.UTC(ano, mes - 1 + VALIDADE_MESES, dia));

  // Brasil não observa horário de verão desde 2019 (mesmo raciocínio já usado no cron de
  // rescisão) — "hoje" em -03:00 sem precisar de biblioteca de timezone.
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [anoHoje, mesHoje, diaHoje] = hojeSP.split("-").map(Number);
  const hoje = new Date(Date.UTC(anoHoje, mesHoje - 1, diaHoje));

  const limiteAviso = new Date(hoje);
  limiteAviso.setUTCDate(limiteAviso.getUTCDate() + ANTECEDENCIA_AVISO_DIAS);

  if (vencimento.getTime() > limiteAviso.getTime()) return "em_dia";
  if (vencimento.getTime() >= hoje.getTime()) return "vencendo";
  return "atrasado";
}

export const ASO_STATUS_INFO: Record<AsoStatus, { label: string; bg: string; text: string }> = {
  // Mais urgente visualmente que "Em atraso" — cor própria (roxo), nunca reaproveitar
  // vermelho: "nenhum registro" é um problema de cadastro, não só um prazo estourado.
  sem_registro: { label: "Sem registro", bg: "#EDE9FE", text: "#5B21B6" },
  em_dia: { label: "Em dia", bg: "#D1FAE5", text: "#166534" },
  vencendo: { label: "Vencendo em breve", bg: "#FEF3C7", text: "#92400E" },
  atrasado: { label: "Em atraso", bg: "#FEE2E2", text: "#991B1B" },
};
