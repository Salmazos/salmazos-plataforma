export type AsoStatus = "sem_registro" | "em_dia" | "vencendo" | "atrasado";

const VALIDADE_MESES = 12;
const ANTECEDENCIA_AVISO_DIAS = 30;

function hojeUTC(): Date {
  // Brasil não observa horário de verão desde 2019 (mesmo raciocínio já usado no cron de
  // rescisão) — "hoje" em -03:00 sem precisar de biblioteca de timezone.
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, mes, dia] = hojeSP.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// Data de vencimento (data_exame + 12 meses) como string YYYY-MM-DD — usada tanto pelo
// cálculo de status abaixo quanto pelo texto dos avisos (cron da Fase 3), que precisa
// mostrar a data de vencimento pro destinatário.
export function calcularDataVencimentoAso(dataExame: string): string {
  const [ano, mes, dia] = dataExame.split("-").map(Number);
  const vencimento = new Date(Date.UTC(ano, mes - 1 + VALIDADE_MESES, dia));
  return vencimento.toISOString().slice(0, 10);
}

// Reusado pela lista de funcionários, pela tela de detalhe, pelo cron de avisos (Fase 3) e
// pelo portal do cliente (Fase 5) — uma única fonte pra "o que significa vencido" nunca
// divergir entre esses pontos.
export function calcularStatusAso(dataExameMaisRecente: string | null): AsoStatus {
  if (!dataExameMaisRecente) return "sem_registro";

  const [anoVenc, mesVenc, diaVenc] = calcularDataVencimentoAso(dataExameMaisRecente).split("-").map(Number);
  const vencimento = new Date(Date.UTC(anoVenc, mesVenc - 1, diaVenc));

  const hoje = hojeUTC();
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
