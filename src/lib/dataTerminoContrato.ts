// Data de término da contratação MOT e Terceirização (mesma regra do "Finalizar" do Kanban: obrigatória, até 180 dias
// da data de início; R&S não tem). Aqui também: não anterior ao início. O campo NUNCA é deduzido de admissao_tempo_contrato (texto padrão igual em todas as
// indicações, não é fonte confiável de data). Na tela do analista ele vem SUGERIDO com início + 90 dias (o mesmo cálculo do botão "+90 dias", sempre dentro do
// máximo de 180) e continua editável: antes, começar vazio fazia o botão de aprovar ficar travado até alguém clicar em "+90 dias", o que confundia.
// Compartilhado entre o servidor (valida de verdade) e o modal (só orienta).
export const MAX_DIAS_CONTRATO = 180;
export const DIAS_AUXILIAR_PRORROGACAO = 90;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function utcMs(iso: string): number | null {
  if (!ISO.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return ms;
}

export function somarDiasIso(iso: string, dias: number): string | null {
  const ms = utcMs(iso);
  if (ms === null) return null;
  return new Date(ms + dias * 86_400_000).toISOString().slice(0, 10);
}

// Valor mostrado e enviado na aprovação: o que o analista digitou/alterou (inclusive vazio, se ele apagou) NUNCA é sobrescrito; sem edição, vale a
// sugestão início + 90 dias, que acompanha mudanças da data de início. Sem início válido, vazio.
export function dataFimEfetiva(editada: string | undefined, inicio: string | null | undefined): string {
  if (editada !== undefined) return editada;
  return somarDiasIso((inicio ?? "").trim(), DIAS_AUXILIAR_PRORROGACAO) ?? "";
}

export function diasEntre(inicio: string, fim: string): number | null {
  const a = utcMs(inicio);
  const b = utcMs(fim);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

// null = válida. Mensagem pronta para exibir.
export function erroDataTermino(inicio: string | null | undefined, fim: string | null | undefined): string | null {
  const f = (fim ?? "").trim();
  if (!f) return `Informe a data de término (obrigatória em MOT e Terceirização, até ${MAX_DIAS_CONTRATO} dias após o início).`;
  const i = (inicio ?? "").trim();
  if (!i) return "Sem data de início não dá para validar a data de término.";
  const dias = diasEntre(i, f);
  if (dias === null) return "Data de término inválida.";
  if (dias < 0) return "A data de término não pode ser anterior à data de início.";
  if (dias > MAX_DIAS_CONTRATO) return `A data de término passa de ${MAX_DIAS_CONTRATO} dias após o início (máximo permitido).`;
  return null;
}
