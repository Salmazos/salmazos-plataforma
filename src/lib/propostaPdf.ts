import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PDFDocument, PDFFont, PDFImage, PDFPage, PageSizes, StandardFonts } from "pdf-lib";
import { BLACK, CW, DARK, GRAY, ML, PH, PW, YELLOW } from "@/lib/pdfWriter";
import { ASSINATURA_RS, FRASE_EFEITO_RS, TEMPLATE_VERSAO_COM_INTRODUCAO, TITULO_RS, itensAdicionais, itensRs, type SnapshotProposta } from "@/lib/propostaModelos";
import { paragrafosDesenhaveis, textoDesenhavel } from "@/lib/propostaTexto";
import { numeroComRevisao } from "@/lib/propostas";
import { ENDERECOS_RODAPE_PROPOSTA, PASTA_CABECALHO_PROPOSTA, PASTA_CLIENTES_PROPOSTA } from "@/lib/propostaAssets";

export interface OpcoesPdfProposta {
  pastaCabecalho?: string;
  pastaClientes?: string;
  enderecosRodape?: string[];
}

// Caixa de cada logo de cliente, em pixels, e ampliação máxima (logo pequeno não vira borrão).
export const CAIXA_LOGO_W = 300;
export const CAIXA_LOGO_H = 120;
const AMPLIACAO_MAXIMA = 2;
const LOGOS_POR_LINHA = 4;
const ESPACO_ENTRE_LOGOS = 12;
const LIMITE_CACHE = 64;
const ALTURA_LOGO_CABECALHO = 50;
// Template v2: logo maior (70pt de altura, ~155pt de largura) e faixa preta proporcional; o título da proposta fica abaixo da faixa.
const ALTURA_LOGO_CABECALHO_V2 = 70;
const ALTURA_CABECALHO_CHEIO_V2 = 110;
// Marca d'água: logo grande e pálido, centralizado, atrás do texto em todas as páginas.
const LARGURA_MARCA_DAGUA = CW * 0.9;
const OPACIDADE_MARCA_DAGUA = 0.14;
// Respiro em volta da frase de efeito (v2): cerca de uma linha em branco a mais do que antes (4 acima, 8 abaixo).
const ESPACO_ACIMA_FRASE = 4 + 15;
const ESPACO_ABAIXO_FRASE = 8 + 15;
const LARGURA_MAX_LOGO_CABECALHO_PX = 800;
const LADO_MAXIMO_ENTRADA_PX = 1200;

const ALTURA_CABECALHO_CHEIO = 90;
const ALTURA_CABECALHO_COMPACTO = 32;
const TAMANHO_RODAPE = 7.5;

// Helvetica padrão (WinAnsi) não desenha tudo: a regra de sanitização está em propostaTexto (emoji e afins são omitidos, nunca derrubam o PDF).
const limpar = textoDesenhavel;

export function formatarDataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Palavra mais larga que a linha (endereço, CNPJ, e-mail sem espaço) é dividida por caractere, como último recurso,
// em vez de passar da margem.
function dividirPalavra(palavra: string, font: PDFFont, size: number, largura: number): string[] {
  const partes: string[] = [];
  let atual = "";
  for (const ch of palavra) {
    const tentativa = atual + ch;
    if (atual && font.widthOfTextAtSize(tentativa, size) > largura) {
      partes.push(atual);
      atual = ch;
    } else {
      atual = tentativa;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

export function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  let linha = "";
  for (const palavra of limpar(texto).split(" ")) {
    if (font.widthOfTextAtSize(palavra, size) > largura) {
      if (linha) linhas.push(linha);
      const partes = dividirPalavra(palavra, font, size, largura);
      linhas.push(...partes.slice(0, -1));
      linha = partes[partes.length - 1] ?? "";
      continue;
    }
    const tentativa = linha ? `${linha} ${palavra}` : palavra;
    if (linha && font.widthOfTextAtSize(tentativa, size) > largura) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = tentativa;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

// ── Imagens ──────────────────────────────────────────────────────────────────

const cacheLogos = new Map<string, Buffer>();
function guardarNoCache(chave: string, valor: Buffer): void {
  if (cacheLogos.size >= LIMITE_CACHE) cacheLogos.delete(cacheLogos.keys().next().value as string);
  cacheLogos.set(chave, valor);
}

async function listarArquivos(pasta: string, extensoes: string[]): Promise<string[]> {
  let nomes: string[];
  try {
    nomes = await fs.readdir(pasta);
  } catch {
    return [];
  }
  return nomes
    .filter((n) => extensoes.includes(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) || a.localeCompare(b));
}

// Fundo branco, sem margem em volta e dentro da caixa 300x120 (até 2x de ampliação), sempre em PNG.
// Reduz primeiro (as margens encolhem junto): logos de milhares de pixels não passam inteiros pelo flatten e pelo trim.
export async function prepararLogoCliente(bytes: Buffer): Promise<Buffer> {
  const reduzida = await sharp(bytes).resize({ width: LADO_MAXIMO_ENTRADA_PX, height: LADO_MAXIMO_ENTRADA_PX, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const achatada = await sharp(reduzida).flatten({ background: "#ffffff" }).png().toBuffer();
  let base = achatada;
  try {
    const aparada = await sharp(achatada).trim({ threshold: 10 }).toBuffer();
    const m = await sharp(aparada).metadata();
    if ((m.width ?? 0) > 1 && (m.height ?? 0) > 1) base = aparada;
  } catch {
    // imagem de uma cor só não tem o que aparar: segue com a original.
  }
  const { width = 1, height = 1 } = await sharp(base).metadata();
  const escala = Math.min(CAIXA_LOGO_W / width, CAIXA_LOGO_H / height, AMPLIACAO_MAXIMA);
  return sharp(base)
    .resize(Math.max(1, Math.round(width * escala)), Math.max(1, Math.round(height * escala)), { fit: "fill" })
    .png()
    .toBuffer();
}

interface LogoCliente {
  nome: string;
  png: Buffer;
}

export async function carregarLogosClientes(pasta: string): Promise<LogoCliente[]> {
  const nomes = await listarArquivos(pasta, [".png", ".jpg", ".jpeg"]);
  const logos: LogoCliente[] = [];
  for (const nome of nomes) {
    try {
      const arquivo = path.join(pasta, nome);
      const st = await fs.stat(arquivo);
      const chave = `${arquivo}|${st.size}|${st.mtimeMs}`;
      let png = cacheLogos.get(chave);
      if (!png) {
        png = await prepararLogoCliente(await fs.readFile(arquivo));
        guardarNoCache(chave, png);
      }
      logos.push({ nome, png });
    } catch (err) {
      console.warn(`[propostaPdf] Logo de cliente ignorado (${nome}):`, err instanceof Error ? err.message : err);
    }
  }
  return logos;
}

async function carregarLogoCabecalho(pasta: string): Promise<Buffer | null> {
  const [primeiro] = await listarArquivos(pasta, [".png"]);
  if (!primeiro) return null;
  try {
    const arquivo = path.join(pasta, primeiro);
    const st = await fs.stat(arquivo);
    const chave = `cab|${arquivo}|${st.size}|${st.mtimeMs}`;
    let png = cacheLogos.get(chave);
    if (!png) {
      png = await sharp(await fs.readFile(arquivo)).resize({ width: LARGURA_MAX_LOGO_CABECALHO_PX, withoutEnlargement: true }).png().toBuffer();
      guardarNoCache(chave, png);
    }
    return png;
  } catch (err) {
    console.warn(`[propostaPdf] Logo do cabeçalho ignorado (${primeiro}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Desenho ──────────────────────────────────────────────────────────────────

class Escritor {
  page!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly logoCabecalho: PDFImage | null,
    readonly rodape: string[],
    readonly v2 = false
  ) {}

  private get reservadoRodape(): number {
    return 14 + this.rodape.length * (TAMANHO_RODAPE + 3) + 10;
  }

  novaPagina(cheia: boolean) {
    this.page = this.doc.addPage(PageSizes.A4);
    if (this.v2 && this.logoCabecalho) this.desenharMarcaDagua(this.logoCabecalho);
    const altura = cheia ? (this.v2 ? ALTURA_CABECALHO_CHEIO_V2 : ALTURA_CABECALHO_CHEIO) : ALTURA_CABECALHO_COMPACTO;
    const alturaLogo = this.v2 ? ALTURA_LOGO_CABECALHO_V2 : ALTURA_LOGO_CABECALHO;
    this.page.drawRectangle({ x: 0, y: PH - altura, width: PW, height: altura, color: BLACK });
    if (cheia && this.logoCabecalho) {
      const escala = alturaLogo / this.logoCabecalho.height;
      const largura = this.logoCabecalho.width * escala;
      this.page.drawImage(this.logoCabecalho, { x: (PW - largura) / 2, y: PH - altura + (altura - alturaLogo) / 2, width: largura, height: alturaLogo });
    } else {
      const texto = "SALMAZOS RH & SERVIÇOS";
      const tamanho = cheia ? 20 : 12;
      const w = this.bold.widthOfTextAtSize(limpar(texto), tamanho);
      this.page.drawText(limpar(texto), { x: (PW - w) / 2, y: PH - altura / 2 - tamanho * 0.35, size: tamanho, font: this.bold, color: YELLOW });
    }
    let yRodape = 14 + (this.rodape.length - 1) * (TAMANHO_RODAPE + 3);
    for (const linha of this.rodape) {
      const w = this.regular.widthOfTextAtSize(linha, TAMANHO_RODAPE);
      this.page.drawText(linha, { x: Math.max(ML / 2, (PW - w) / 2), y: yRodape, size: TAMANHO_RODAPE, font: this.regular, color: GRAY });
      yRodape -= TAMANHO_RODAPE + 3;
    }
    this.y = PH - altura - 24;
  }

  // Desenhada ANTES de todo o resto da página, então fica atrás do texto. Centralizada na área útil (entre a faixa e o rodapé).
  private desenharMarcaDagua(logo: PDFImage) {
    const largura = LARGURA_MARCA_DAGUA;
    const altura = (logo.height * largura) / logo.width;
    const topo = PH - ALTURA_CABECALHO_COMPACTO;
    const base = this.reservadoRodape;
    this.page.drawImage(logo, { x: (PW - largura) / 2, y: base + (topo - base - altura) / 2, width: largura, height: altura, opacity: OPACIDADE_MARCA_DAGUA });
  }

  // Cabe `necessario` pt a partir do y atual sem invadir o rodapé?
  cabe(necessario: number): boolean {
    return this.y - necessario >= this.reservadoRodape;
  }

  garantirEspaco(necessario: number) {
    if (this.y - necessario < this.reservadoRodape) this.novaPagina(false);
  }

  espaco(pt: number) {
    this.y -= pt;
  }

  centralizado(texto: string, font: PDFFont, size: number) {
    for (const linha of quebrar(texto, font, size, CW)) {
      this.garantirEspaco(size + 4);
      const w = font.widthOfTextAtSize(linha, size);
      this.page.drawText(linha, { x: (PW - w) / 2, y: this.y, size, font, color: BLACK });
      this.y -= size * 1.4;
    }
  }

  // "Rótulo: valor" com o valor quebrando alinhado sob si mesmo.
  campo(rotulo: string, valor: string) {
    const size = 10.5;
    const r = `${limpar(rotulo)}: `;
    const larguraRotulo = this.bold.widthOfTextAtSize(r, size);
    const linhas = quebrar(valor, this.regular, size, CW - larguraRotulo);
    linhas.forEach((linha, i) => {
      this.garantirEspaco(size + 4);
      if (i === 0) this.page.drawText(r, { x: ML, y: this.y, size, font: this.bold, color: DARK });
      this.page.drawText(linha, { x: ML + larguraRotulo, y: this.y, size, font: this.regular, color: DARK });
      this.y -= size * 1.45;
    });
  }

  // Item numerado com recuo único: o número fica na margem, o texto sempre na mesma coluna.
  item(numero: string, texto: string) {
    const size = 10.5;
    const recuo = 30;
    const linhas = quebrar(texto, this.regular, size, CW - recuo);
    linhas.forEach((linha, i) => {
      this.garantirEspaco(size + 4);
      if (i === 0) this.page.drawText(limpar(numero), { x: ML, y: this.y, size, font: this.bold, color: DARK });
      this.page.drawText(linha, { x: ML + recuo, y: this.y, size, font: this.regular, color: DARK });
      this.y -= size * 1.45;
    });
    this.y -= 4;
  }

  paragrafo(texto: string, font: PDFFont = this.regular, size = 10.5) {
    for (const linha of quebrar(texto, font, size, CW)) {
      this.garantirEspaco(size + 4);
      this.page.drawText(linha, { x: ML, y: this.y, size, font, color: DARK });
      this.y -= size * 1.45;
    }
  }

  // Texto livre em parágrafos (quebras de linha do vendedor viram parágrafos), com um respiro entre eles.
  textoLivre(texto: string) {
    for (const par of paragrafosDesenhaveis(texto)) {
      this.paragrafo(par);
      this.y -= 4;
    }
  }

  // Altura de um item numerado (mesma conta de item()): usada para manter a frase de efeito junto da 1.1.
  alturaItem(texto: string): number {
    const size = 10.5;
    return quebrar(texto, this.regular, size, CW - 30).length * size * 1.45 + 4;
  }

  // Linha única centralizada em negrito, com filete amarelo fino logo abaixo. O texto é fixo do template: o tamanho
  // diminui só o necessário para caber em UMA linha (nunca quebra em duas). Nunca fica sozinha no fim da página: se a frase
  // e o primeiro item (`textoPrimeiroItem`) não cabem juntos, vai para a página seguinte, sem somar o respiro de cima.
  fraseDeEfeito(texto: string, textoPrimeiroItem: string) {
    const t = limpar(texto);
    let size = 11;
    while (size > 8 && this.bold.widthOfTextAtSize(t, size) > CW) size -= 0.25;
    const alturaFrase = size * 1.4 + 8;
    if (this.cabe(ESPACO_ACIMA_FRASE + alturaFrase + ESPACO_ABAIXO_FRASE + this.alturaItem(textoPrimeiroItem))) this.y -= ESPACO_ACIMA_FRASE;
    else this.novaPagina(false);
    const w = this.bold.widthOfTextAtSize(t, size);
    this.page.drawText(t, { x: (PW - w) / 2, y: this.y, size, font: this.bold, color: BLACK });
    this.page.drawLine({ start: { x: (PW - w) / 2, y: this.y - 5 }, end: { x: (PW + w) / 2, y: this.y - 5 }, thickness: 1.2, color: YELLOW });
    this.y -= alturaFrase + ESPACO_ABAIXO_FRASE;
  }

  // Validade + assinatura são UM bloco: se não cabe inteiro, vai inteiro para a página seguinte (nunca a validade numa página
  // e a assinatura em outra). O respiro entre os dois fica dentro do bloco; no topo de página nova não se soma espaço acima.
  blocoValidadeEAssinatura(validade: string, linhas: { texto: string; font: PDFFont }[], folga: number, size = 10.5) {
    const passo = size * 1.45;
    const partesValidade = quebrar(validade, this.regular, size, CW);
    const assinatura = linhas.map((l) => ({ ...l, partes: quebrar(l.texto, l.font, size, CW) }));
    const alturaAssinatura = assinatura.reduce((soma, l) => soma + l.partes.length * passo, 0);
    const antes = 6;
    if (this.cabe(antes + partesValidade.length * passo + folga + alturaAssinatura + 4)) this.y -= antes;
    else this.novaPagina(false);
    for (const parte of partesValidade) {
      this.page.drawText(parte, { x: ML, y: this.y, size, font: this.regular, color: DARK });
      this.y -= passo;
    }
    this.y -= folga;
    for (const l of assinatura) {
      for (const parte of l.partes) {
        this.page.drawText(parte, { x: ML, y: this.y, size, font: l.font, color: DARK });
        this.y -= passo;
      }
    }
  }

  faixaTitulo(texto: string) {
    this.garantirEspaco(34);
    this.page.drawRectangle({ x: ML, y: this.y - 20, width: CW, height: 24, color: BLACK });
    this.page.drawText(limpar(texto), { x: ML + 8, y: this.y - 13, size: 11, font: this.bold, color: YELLOW });
    this.y -= 36;
  }
}

// Células todas do mesmo tamanho, 4 por linha; a última linha (incompleta) fica centralizada.
export function calcularGrade(quantidade: number) {
  const celulaW = (CW - ESPACO_ENTRE_LOGOS * (LOGOS_POR_LINHA - 1)) / LOGOS_POR_LINHA;
  const celulaH = (celulaW * CAIXA_LOGO_H) / CAIXA_LOGO_W;
  const linhas: { xs: number[] }[] = [];
  for (let i = 0; i < quantidade; i += LOGOS_POR_LINHA) {
    const n = Math.min(LOGOS_POR_LINHA, quantidade - i);
    const x0 = (PW - (n * celulaW + (n - 1) * ESPACO_ENTRE_LOGOS)) / 2;
    linhas.push({ xs: Array.from({ length: n }, (_, k) => x0 + k * (celulaW + ESPACO_ENTRE_LOGOS)) });
  }
  return { celulaW, celulaH, ptPorPx: celulaW / CAIXA_LOGO_W, linhas };
}

const ALTURA_FAIXA_TITULO = 36;
const ESPACO_ANTES_DA_GRADE = 24;

// Template v2: a grade entra logo depois da assinatura, na mesma página, se couber INTEIRA (faixa + todas as linhas);
// senão começa em página nova, como no v1. No v1 sempre começa em página nova.
async function desenharGradeClientes(e: Escritor, logos: LogoCliente[], mesmaPaginaSeCouber = false) {
  if (logos.length === 0) return;
  const grade = calcularGrade(logos.length);
  const alturaTotal = ALTURA_FAIXA_TITULO + grade.linhas.length * (grade.celulaH + ESPACO_ENTRE_LOGOS);
  if (mesmaPaginaSeCouber && e.cabe(ESPACO_ANTES_DA_GRADE + alturaTotal)) e.espaco(ESPACO_ANTES_DA_GRADE);
  else e.novaPagina(false);
  e.faixaTitulo("Alguns de nossos clientes:");
  let indice = 0;
  for (const linha of grade.linhas) {
    e.garantirEspaco(grade.celulaH + ESPACO_ENTRE_LOGOS);
    for (const x of linha.xs) {
      const img = await e.doc.embedPng(logos[indice++].png);
      const w = img.width * grade.ptPorPx;
      const h = img.height * grade.ptPorPx;
      e.page.drawImage(img, { x: x + (grade.celulaW - w) / 2, y: e.y - grade.celulaH + (grade.celulaH - h) / 2, width: w, height: h });
    }
    e.y -= grade.celulaH + ESPACO_ENTRE_LOGOS;
  }
}

// O PDF sai só do snapshot (nunca de dados vivos): reabrir uma revisão antiga reproduz o mesmo documento.
export async function gerarPdfProposta(snap: SnapshotProposta, opcoes: OpcoesPdfProposta = {}): Promise<Uint8Array> {
  if (snap.modelo !== "RS") throw new Error("Modelo ainda não disponível.");
  const doc = await PDFDocument.create();
  doc.setTitle(`Proposta ${snap.numero}`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const bytesCabecalho = await carregarLogoCabecalho(opcoes.pastaCabecalho ?? PASTA_CABECALHO_PROPOSTA);
  const logoCabecalho = bytesCabecalho ? await doc.embedPng(bytesCabecalho) : null;
  const rodape = (opcoes.enderecosRodape ?? ENDERECOS_RODAPE_PROPOSTA).map(limpar).filter(Boolean);
  const v2 = snap.template_versao >= TEMPLATE_VERSAO_COM_INTRODUCAO;
  const e = new Escritor(doc, regular, bold, logoCabecalho, rodape, v2);

  e.novaPagina(true);
  e.centralizado(TITULO_RS, bold, 13);
  e.espaco(8);
  e.campo("Cliente", snap.cliente_nome);
  if (snap.cliente_cnpj) e.campo("CNPJ", snap.cliente_cnpj);
  if (snap.cliente_endereco) e.campo("Endereço", snap.cliente_endereco);
  if (snap.aos_cuidados) e.campo("A/C", snap.aos_cuidados);
  e.campo("Nº da proposta", numeroComRevisao(snap.numero, snap.revisao));
  e.campo("Data", formatarDataBr(snap.data_emissao));
  e.espaco(10);

  // Template v2: introdução e frase de efeito antes da 1.1. Revisões v1 já emitidas não ganham nada disso.
  if (v2) {
    if (snap.texto_introdutorio) e.textoLivre(snap.texto_introdutorio);
    e.fraseDeEfeito(FRASE_EFEITO_RS, itensRs(snap.condicoes)[0].texto);
  }

  for (const item of itensRs(snap.condicoes)) e.item(item.numero, item.texto);
  if (v2) for (const item of itensAdicionais(snap.clausulas_adicionais ?? [])) e.item(item.numero, item.texto);

  const validade = `Validade da proposta: ${snap.validade_dias} dias corridos, até ${formatarDataBr(snap.validade_ate)}.`;
  const assinatura = [
    { texto: ASSINATURA_RS, font: bold },
    { texto: snap.vendedor_nome, font: regular },
    ...(snap.vendedor_telefone ? [{ texto: snap.vendedor_telefone, font: regular }] : []),
    ...(v2 && snap.vendedor_email ? [{ texto: snap.vendedor_email, font: regular }] : []),
  ];
  // v2: validade + assinatura num bloco só, com cerca de 2 linhas em branco entre os dois. v1 (revisões já emitidas): layout antigo.
  if (v2) e.blocoValidadeEAssinatura(validade, assinatura, 44);
  else {
    e.espaco(6);
    e.paragrafo(validade);
    e.espaco(14);
    e.garantirEspaco(70);
    for (const l of assinatura) e.paragrafo(l.texto, l.font);
  }

  await desenharGradeClientes(e, await carregarLogosClientes(opcoes.pastaClientes ?? PASTA_CLIENTES_PROPOSTA), v2);

  return doc.save();
}
