import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PDFDocument, PDFFont, PDFImage, PDFPage, PageSizes, StandardFonts } from "pdf-lib";
import { BLACK, CW, DARK, GRAY, ML, PH, PW, YELLOW } from "@/lib/pdfWriter";
import { ASSINATURA_RS, TITULO_RS, itensRs, type SnapshotProposta } from "@/lib/propostaModelos";
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
const LARGURA_MAX_LOGO_CABECALHO_PX = 800;

const ALTURA_CABECALHO_CHEIO = 90;
const ALTURA_CABECALHO_COMPACTO = 32;
const TAMANHO_RODAPE = 7.5;

// Helvetica padrão (WinAnsi) não desenha tudo: o que não cabe vira espaço em vez de derrubar o PDF.
const FORA_DO_WINANSI = new RegExp(
  `[^\\x20-\\x7E\\xA0-\\xFF${String.fromCharCode(0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac)}]`,
  "g"
);
function limpar(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\s+/g, " ").replace(FORA_DO_WINANSI, " ").trim();
}

export function formatarDataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  let linha = "";
  for (const palavra of limpar(texto).split(" ")) {
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
export async function prepararLogoCliente(bytes: Buffer): Promise<Buffer> {
  const achatada = await sharp(bytes).flatten({ background: "#ffffff" }).png().toBuffer();
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
    readonly rodape: string[]
  ) {}

  private get reservadoRodape(): number {
    return 14 + this.rodape.length * (TAMANHO_RODAPE + 3) + 10;
  }

  novaPagina(cheia: boolean) {
    this.page = this.doc.addPage(PageSizes.A4);
    const altura = cheia ? ALTURA_CABECALHO_CHEIO : ALTURA_CABECALHO_COMPACTO;
    this.page.drawRectangle({ x: 0, y: PH - altura, width: PW, height: altura, color: BLACK });
    if (cheia && this.logoCabecalho) {
      const escala = ALTURA_LOGO_CABECALHO / this.logoCabecalho.height;
      const largura = this.logoCabecalho.width * escala;
      this.page.drawImage(this.logoCabecalho, { x: (PW - largura) / 2, y: PH - altura + (altura - ALTURA_LOGO_CABECALHO) / 2, width: largura, height: ALTURA_LOGO_CABECALHO });
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

async function desenharGradeClientes(e: Escritor, logos: LogoCliente[]) {
  if (logos.length === 0) return;
  e.novaPagina(false);
  e.faixaTitulo("Alguns de nossos clientes:");
  const grade = calcularGrade(logos.length);
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
  const e = new Escritor(doc, regular, bold, logoCabecalho, rodape);

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

  for (const item of itensRs(snap.condicoes)) e.item(item.numero, item.texto);

  e.espaco(6);
  e.paragrafo(`Validade da proposta: ${snap.validade_dias} dias corridos, até ${formatarDataBr(snap.validade_ate)}.`);

  e.espaco(14);
  e.garantirEspaco(70);
  e.paragrafo(ASSINATURA_RS, bold);
  e.paragrafo(snap.vendedor_nome);
  if (snap.vendedor_telefone) e.paragrafo(snap.vendedor_telefone);

  await desenharGradeClientes(e, await carregarLogosClientes(opcoes.pastaClientes ?? PASTA_CLIENTES_PROPOSTA));

  return doc.save();
}
