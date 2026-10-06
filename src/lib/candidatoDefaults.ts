// Valores padrão das colunas NOT NULL sem default de `candidatos` que as telas de cadastro simplificado não coletam
// (tempo_experiencia e turno_disponivel). Função e constantes puras (sem imports): usadas na Admissão Rápida, na
// aprovação de indicação direta do cliente e no Cadastro Rápido, que antes repetiam os mesmos literais.
export const TEMPO_EXPERIENCIA_PADRAO = "Sem experiência";
export const TURNO_DISPONIVEL_PADRAO = "Flexível";

export function defaultsCandidatoNovo(): { tempo_experiencia: string; turno_disponivel: string } {
  return { tempo_experiencia: TEMPO_EXPERIENCIA_PADRAO, turno_disponivel: TURNO_DISPONIVEL_PADRAO };
}
