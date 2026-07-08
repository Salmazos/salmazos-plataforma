export const ADMISSAO_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "aguardando_candidato", label: "Aguardando candidato" },
  { value: "em_preenchimento", label: "Em preenchimento" },
  { value: "aguardando_analise", label: "Aguardando análise" },
  { value: "em_analise", label: "Em análise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "enviado_contabilidade", label: "Enviado à contabilidade" },
];

export const ADMISSAO_STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  aguardando_candidato: { label: "Aguardando candidato", bg: "#F3F4F6", text: "#4B5563" },
  em_preenchimento: { label: "Em preenchimento", bg: "#DBEAFE", text: "#1D4ED8" },
  aguardando_analise: { label: "Aguardando análise", bg: "#FEF3C7", text: "#92400E" },
  em_analise: { label: "Em análise", bg: "#FFEDD5", text: "#C2410C" },
  aprovado: { label: "Aprovado", bg: "#DCFCE7", text: "#15803D" },
  enviado_contabilidade: { label: "Enviado à contabilidade", bg: "#D1FAE5", text: "#166534" },
};

export const MODALIDADE_LABEL: Record<string, string> = {
  MOT: "MOT",
  terceirizacao: "Terc.",
};

// Status em que o candidato perde o acesso de edição ao formulário público (ver
// STATUS_JA_ENVIADO em AdmissaoFormClient.tsx). O botão "Solicitar correção" em
// AdmissaoDetalheClient.tsx reabre o acesso levando o status de volta pra
// "em_preenchimento" — o único fora dessa lista que faz sentido como "retomando o
// preenchimento" (o outro, "aguardando_candidato", é o estado anterior ao candidato
// sequer ter começado).
export const STATUS_JA_ENVIADO = ["aguardando_analise", "em_analise", "aprovado", "enviado_contabilidade"];
