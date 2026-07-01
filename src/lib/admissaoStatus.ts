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
