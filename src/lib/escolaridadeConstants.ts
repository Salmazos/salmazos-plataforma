// Constantes de escolaridade compartilhadas — baseado no que já existia hardcoded em
// src/app/painel/../portal/(app)/solicitar-vaga/page.tsx (chips de requisito de vaga,
// multi-seleção), com Pós-graduação adicionada pro uso nos formulários de candidato
// (seleção única, ver SeletorEscolaridade.tsx). O portal continua com seus próprios
// arrays locais — não foi migrado pra cá.

export const NIVEIS_ESCOLARIDADE = [
  "Ensino Fundamental",
  "Ensino Médio",
  "Ensino Técnico",
  "Ensino Superior",
  "Pós-graduação",
] as const;

export type NivelEscolaridade = (typeof NIVEIS_ESCOLARIDADE)[number];

// Níveis que pedem o campo de curso ("em [curso]") — Fundamental e Médio não pedem.
export const NIVEIS_COM_CURSO = new Set<string>(["Ensino Técnico", "Ensino Superior", "Pós-graduação"]);

const CONDICOES_SIMPLES = ["Completo", "Cursando"];
const CONDICOES_TECNICO = ["Completo", "Cursando", "Completo ou Cursando"];
const CONDICOES_SUPERIOR = ["Completo", "Cursando", "Completo ou Cursando", "A partir do 3º semestre", "A partir do 6º semestre"];
const CONDICOES_POS = ["Completo", "Cursando"];

// Fundamental/Médio usam a mesma lista simples do Técnico? Não — Técnico tem "Completo ou
// Cursando" a mais. Fundamental/Médio ficam só com Completo/Cursando, como já era no portal.
export function condicoesPorNivel(nivel: string): string[] {
  if (nivel === "Ensino Superior") return CONDICOES_SUPERIOR;
  if (nivel === "Ensino Técnico") return CONDICOES_TECNICO;
  if (nivel === "Pós-graduação") return CONDICOES_POS;
  return CONDICOES_SIMPLES;
}

// Mesmo formato já usado no portal: "{nivel} em {curso} — {condição}".
export function montarTextoEscolaridade(nivel: string, curso: string, condicao: string): string {
  if (!nivel) return "";
  let texto = nivel;
  if (curso.trim()) texto += ` em ${curso.trim()}`;
  if (condicao) texto += ` — ${condicao}`;
  return texto;
}
