// Sanitização do texto que vai para o PDF da proposta. Módulo puro (sem imports de servidor): o PDF e a tela usam a mesma regra.
// Helvetica padrão (WinAnsi) só desenha Latin-1 e alguns símbolos do bloco 0x80–0x9F; o resto (emoji, setas, CJK...) derrubaria a geração.

const WINANSI_EXTRAS = [
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
];
const EXTRAS = new Set(WINANSI_EXTRAS);

function desenhavel(cp: number): boolean {
  return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || EXTRAS.has(cp);
}

// Invisíveis que acompanham emoji e texto colado (ZWJ, seletores de variação, ZWSP, marca de ordem de bytes...): somem sem deixar espaço.
const INVISIVEIS = /[\u200b-\u200f\u2060-\u2064\ufe00-\ufe0f\ufeff\u00ad]/g;

// Equivalentes tipográficos que o WinAnsi não tem, mas têm um correspondente fiel.
const EQUIVALENTES: Record<number, string> = {
  0x2010: "-", 0x2011: "-", 0x2012: "-", 0x2015: "\u2014", 0x2212: "-", 0x2032: "'", 0x2033: '"',
  0x02bc: "'", 0x201b: "'", 0x201f: '"', 0x2024: ".", 0x2043: "-",
};

function substituir(ch: string): string {
  const cp = ch.codePointAt(0) as number;
  if (desenhavel(cp)) return ch;
  if (EQUIVALENTES[cp]) return EQUIVALENTES[cp];
  // Letra acentuada fora do Latin-1 (ő, ł→l não decompõe, ū...): tenta a letra base.
  const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (base !== ch && [...base].every((c) => desenhavel(c.codePointAt(0) as number))) return base;
  return "";
}

export function textoDesenhavel(texto: string | null | undefined): string {
  const t = (texto ?? "").normalize("NFC").replace(INVISIVEIS, "");
  let saida = "";
  let omitiu = false;
  // for...of percorre por ponto de código: um emoji (par substituto) é um único caractere removido.
  for (const ch of t) {
    const novo = /\s/.test(ch) ? " " : substituir(ch);
    if (novo === "" && !/\s/.test(ch)) omitiu = true;
    saida += novo;
  }
  saida = saida.replace(/ +/g, " ").trim();
  // "Prezados 😀," não pode sobrar como "Prezados ,": só mexe na pontuação quando algo foi omitido.
  return omitiu ? saida.replace(/ +([,.;:!?)])/g, "$1") : saida;
}

// O que o PDF não consegue desenhar e será omitido (para avisar o vendedor na tela). Não conta espaços nem quebras de linha.
export function caracteresOmitidos(texto: string | null | undefined): string[] {
  const t = (texto ?? "").normalize("NFC").replace(INVISIVEIS, "");
  const omitidos = new Set<string>();
  for (const ch of t) if (!/\s/.test(ch) && substituir(ch) === "") omitidos.add(ch);
  return [...omitidos];
}

// Parágrafos separados por quebra de linha; linhas em branco não geram parágrafo vazio.
export function paragrafosDesenhaveis(texto: string | null | undefined): string[] {
  return (texto ?? "").split(/\r?\n/).map(textoDesenhavel).filter(Boolean);
}
