import { CATEGORIAS_HABILITACAO, REQ_CNH, type PerfilExtra } from "./solicitacaoVagaCampos";

// "Perfil do candidato" da solicitação de vaga do portal: estado do formulário, validação, conversão para perfil_extra (a mesma coluna jsonb e as
// mesmas chaves do link público, mais idade_min e idade_max) e leitura para o resumo e o cartão do painel. Funções puras, sem I/O.

export type SexoPerfil = "indiferente" | "masc" | "fem";
export type SimNaoPerfil = "sim" | "nao";

export interface PerfilPortal {
  sexo: SexoPerfil;
  idadeMin: string;
  idadeMax: string;
  pcd: SimNaoPerfil;
  habilitacao: SimNaoPerfil;
  habilitacaoCategoria: string;
  veiculoProprio: SimNaoPerfil;
  localTrabalho: string;
}

// Mesmos padrões do link: Indiferente, PCD Não, CNH Não, veículo Não.
export const PERFIL_VAZIO: PerfilPortal = {
  sexo: "indiferente", idadeMin: "", idadeMax: "", pcd: "nao", habilitacao: "nao", habilitacaoCategoria: "", veiculoProprio: "nao", localTrabalho: "",
};

export const IDADE_MINIMA_PERMITIDA = 14;
export const IDADE_MAXIMA_PERMITIDA = 90;
export const LIMITE_LOCAL_TRABALHO = 300;

export const ROTULO_SEXO: Record<string, string> = { masc: "Masculino", fem: "Feminino", indiferente: "Indiferente" };

const inteiroOuNulo = (texto: string): number | null => {
  const t = texto.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
};

// Erros por campo (chaves: idade_min, idade_max, habilitacao_categoria, local_trabalho). Vazio = tudo certo. As mesmas regras que o servidor aplica.
export function validarPerfilPortal(p: PerfilPortal): Record<string, string> {
  const erros: Record<string, string> = {};
  const faixa = `Informe um número inteiro entre ${IDADE_MINIMA_PERMITIDA} e ${IDADE_MAXIMA_PERMITIDA}.`;
  const min = p.idadeMin.trim() === "" ? null : inteiroOuNulo(p.idadeMin);
  const max = p.idadeMax.trim() === "" ? null : inteiroOuNulo(p.idadeMax);
  if (p.idadeMin.trim() !== "" && (min === null || min < IDADE_MINIMA_PERMITIDA || min > IDADE_MAXIMA_PERMITIDA)) erros.idade_min = faixa;
  if (p.idadeMax.trim() !== "" && (max === null || max < IDADE_MINIMA_PERMITIDA || max > IDADE_MAXIMA_PERMITIDA)) erros.idade_max = faixa;
  if (!erros.idade_min && !erros.idade_max && min !== null && max !== null && min > max) erros.idade_max = "A idade máxima não pode ser menor que a mínima.";
  if (p.habilitacao === "sim" && !(CATEGORIAS_HABILITACAO as readonly string[]).includes(p.habilitacaoCategoria)) erros.habilitacao_categoria = "Escolha a categoria da habilitação.";
  if (p.localTrabalho.length > LIMITE_LOCAL_TRABALHO) erros.local_trabalho = `Use no máximo ${LIMITE_LOCAL_TRABALHO} caracteres.`;
  return erros;
}

export interface PerfilExtraPortal {
  sexo: SexoPerfil;
  pcd: SimNaoPerfil;
  habilitacao_categoria: string | null;
  veiculo_proprio: SimNaoPerfil;
  idade_min: number | null;
  idade_max: number | null;
  local_trabalho: string | null;
}

// O que vai no corpo do POST (e é gravado em solicitacoes_vagas.perfil_extra). Categoria só vale com "Habilitação: Sim".
export function perfilExtraDoFormulario(p: PerfilPortal): PerfilExtraPortal {
  return {
    sexo: p.sexo,
    pcd: p.pcd,
    habilitacao_categoria: p.habilitacao === "sim" ? p.habilitacaoCategoria || null : null,
    veiculo_proprio: p.veiculoProprio,
    idade_min: inteiroOuNulo(p.idadeMin),
    idade_max: inteiroOuNulo(p.idadeMax),
    local_trabalho: p.localTrabalho.trim() || null,
  };
}

// Texto da idade: faixa nova (idade_min e idade_max) ou, quando não há, a chave antiga "idade" (texto livre do link).
export function idadeLegivel(p: Pick<PerfilExtra, "idade_min" | "idade_max" | "idade"> | null | undefined): string | null {
  if (!p) return null;
  const min = typeof p.idade_min === "number" ? p.idade_min : null;
  const max = typeof p.idade_max === "number" ? p.idade_max : null;
  if (min !== null && max !== null) return `De ${min} a ${max} anos`;
  if (min !== null) return `A partir de ${min} anos`;
  if (max !== null) return `Até ${max} anos`;
  return p.idade?.trim() || null;
}

export interface TemplateConvertido {
  chips: string[];
  habilitacao: SimNaoPerfil;
  habilitacaoCategoria: string;
}

// Templates salvos antes da mudança podem trazer o chip "CNH B/C/D/E" em requisitos_chips. O chip sai da lista e vira Habilitação = Sim com a
// categoria do chip. Com mais de um chip de CNH não se escolhe pelo cliente: fica Habilitação = Sim sem categoria, e a pessoa precisa escolher.
export function converterChipsDeTemplate(chips: readonly string[] | null | undefined): TemplateConvertido {
  const lista = chips ?? [];
  const cnh = lista.filter((c) => (REQ_CNH as readonly string[]).includes(c));
  const restantes = lista.filter((c) => !(REQ_CNH as readonly string[]).includes(c));
  if (cnh.length === 0) return { chips: [...lista], habilitacao: "nao", habilitacaoCategoria: "" };
  return { chips: restantes, habilitacao: "sim", habilitacaoCategoria: cnh.length === 1 ? cnh[0].replace("CNH ", "") : "" };
}

export interface LinhaPerfil {
  rotulo: string;
  valor: string | null;
}

// Linhas de perfil lidas de perfil_extra (cartão do painel): só o que veio preenchido.
export function linhasDoPerfilExtra(p: PerfilExtra | null | undefined): LinhaPerfil[] {
  const sim = (v: string | null | undefined) => (v === "sim" ? "Sim" : v === "nao" ? "Não" : null);
  const e = p ?? {};
  return [
    { rotulo: "Sexo", valor: e.sexo ? ROTULO_SEXO[e.sexo] ?? e.sexo : null },
    { rotulo: "Idade", valor: idadeLegivel(e) },
    { rotulo: "PCD", valor: sim(e.pcd) },
    { rotulo: "Habilitação", valor: e.habilitacao_categoria ? `Categoria ${e.habilitacao_categoria}` : null },
    { rotulo: "Veículo próprio", valor: sim(e.veiculo_proprio) },
    { rotulo: "Local de trabalho", valor: e.local_trabalho ?? null },
  ];
}
