// Rótulos do checklist de supervisão — fonte única compartilhada entre KmTab.tsx (formulário
// de lançamento) e ModalDetalheVisitaSupervisao.tsx (visualização somente-leitura), pra nunca
// divergir do texto mostrado ao usuário (já aconteceu uma vez: "Completa/Incompleta" trocado
// por "Sim/Não" só no formulário, sem isso os dois lugares ficariam com rótulos diferentes).

export const CHECKLIST_EQUIPE = [
  { value: "sim", label: "Sim" },
  { value: "parcial", label: "Parcial" },
  { value: "nao", label: "Não" },
] as const;

export const CHECKLIST_EPI = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
  { value: "na", label: "N/A" },
] as const;

export const CHECKLIST_SIM_NAO = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
] as const;

export const CHECKLIST_AMBIENTE = [
  { value: "ok", label: "OK" },
  { value: "atencao", label: "Atenção" },
] as const;

export const CHECKLIST_FEEDBACK = [
  { value: "positivo", label: "Positivo" },
  { value: "neutro", label: "Neutro" },
  { value: "negativo", label: "Negativo" },
] as const;

function rotulo(opcoes: readonly { value: string; label: string }[], valor: string | null): string {
  if (!valor) return "—";
  return opcoes.find((o) => o.value === valor)?.label ?? valor;
}

export function rotuloEquipeCompleta(v: string | null): string { return rotulo(CHECKLIST_EQUIPE, v); }
export function rotuloEpi(v: string | null): string { return rotulo(CHECKLIST_EPI, v); }
export function rotuloUniforme(v: string | null): string { return rotulo(CHECKLIST_SIM_NAO, v); }
export function rotuloPontualidade(v: string | null): string { return rotulo(CHECKLIST_SIM_NAO, v); }
export function rotuloAmbiente(v: string | null): string { return rotulo(CHECKLIST_AMBIENTE, v); }
export function rotuloFeedbackCliente(v: string | null): string { return rotulo(CHECKLIST_FEEDBACK, v); }
