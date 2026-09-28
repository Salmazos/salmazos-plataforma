// Detecta o que precisa de justificativa do RH num dia do espelho de ponto — deliberadamente
// SEM usar a letra (D/F/em branco) que o EzePoint imprime antes da data: investigação com
// arquivos reais mostrou que ela reflete se existe uma escala configurada pro funcionário
// naquele dia, não se algo saiu do padrão (tem dia "D" perfeitamente normal, sem atraso nem
// falta). Critério confirmado com o Olver (set/2026): atraso>0, falta>0, atestado, ou número
// ímpar de marcações (sinal de que faltou bater entrada ou saída). "Suspensão" nunca aparece
// no export — é sempre lançada manualmente pelo RH depois (ver TIPOS_OCORRENCIA_PONTO).

export type TipoOcorrenciaPonto =
  | "atraso"
  | "falta"
  | "atestado_medico"
  | "atestado_horas"
  | "suspensao"
  | "marcacao_incompleta"
  | "outro";

export const ROTULO_OCORRENCIA_PONTO: Record<TipoOcorrenciaPonto, string> = {
  atraso: "Atraso",
  falta: "Falta",
  atestado_medico: "Atestado médico",
  atestado_horas: "Atestado de horas",
  suspensao: "Suspensão",
  marcacao_incompleta: "Não registrou entrada ou saída",
  outro: "Outro",
};

const NOTAS_SEM_ACAO = new Set(["NÃO ADMITIDO", "Folga"]);

function valorZerado(v: string | undefined | null): boolean {
  if (!v) return true;
  const s = v.trim();
  return s === "" || s === "00:00" || s === "0";
}

export interface DiaParaClassificar {
  notaOriginal: string | null;
  campos: Record<string, string>;
  numeroMarcacoes: number;
}

export interface ClassificacaoDia {
  foraPadrao: boolean;
  tipoOcorrencia: TipoOcorrenciaPonto | null;
}

export function classificarDia({ notaOriginal, campos, numeroMarcacoes }: DiaParaClassificar): ClassificacaoDia {
  const nota = (notaOriginal ?? "").trim();

  if (NOTAS_SEM_ACAO.has(nota)) {
    return { foraPadrao: false, tipoOcorrencia: null };
  }

  // Ordem de prioridade: falta > atestado > atraso > marcação incompleta. Um dia pode ter
  // mais de um sinal (ex: atraso E marcação ímpar) — fica só com o mais relevante pro RH
  // decidir; ele pode trocar o tipo na revisão se achar que outro se aplica melhor.
  if (!valorZerado(campos.FA) || nota === "Falta" || nota === "Falta - Banco de Horas") {
    return { foraPadrao: true, tipoOcorrencia: "falta" };
  }
  if (nota === "Atestado Médico") {
    return { foraPadrao: true, tipoOcorrencia: "atestado_medico" };
  }
  if (nota === "Atestado de horas") {
    return { foraPadrao: true, tipoOcorrencia: "atestado_horas" };
  }
  if (!valorZerado(campos.AT)) {
    return { foraPadrao: true, tipoOcorrencia: "atraso" };
  }
  if (numeroMarcacoes > 0 && numeroMarcacoes % 2 !== 0) {
    return { foraPadrao: true, tipoOcorrencia: "marcacao_incompleta" };
  }
  if (nota && nota !== "") {
    // Observação não catalogada — melhor sinalizar pro RH olhar do que engolir em silêncio.
    return { foraPadrao: true, tipoOcorrencia: "outro" };
  }
  return { foraPadrao: false, tipoOcorrencia: null };
}
