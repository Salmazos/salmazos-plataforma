import fs from "fs";
import path from "path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts, PageSizes } from "pdf-lib";

export const PW = PageSizes.A4[0];
export const PH = PageSizes.A4[1];
export const ML = 50;
export const CW = PW - ML * 2;

export const BLACK = rgb(0, 0, 0);
export const YELLOW = rgb(1, 0.843, 0);
export const DARK = rgb(0.12, 0.14, 0.16);
export const GRAY = rgb(0.43, 0.46, 0.50);
export const LIGHT_GRAY = rgb(0.7, 0.72, 0.75);

// Faixas fixas desenhadas em toda página por newPage() (ver drawHeader/drawFooter) — logo
// no topo e timbre com endereço no rodapé. Nenhum template precisa chamar nada extra.
const LOGO_H = 30; // altura de desenho do logo; a largura é calculada a partir da proporção original da imagem
const HEADER_RESERVED = 62; // y onde o conteúdo do corpo começa em cada página nova (abaixo do logo, com respiro)
// Igual ao limite inferior original (ML + 20) — já havia espaço de sobra nessa margem pra
// caber o rodapé sem precisar reduzir a área útil de conteúdo nem mudar a paginação existente.
const FOOTER_RESERVED = ML + 20;
const FOOTER_TEXT_Y = 28; // altura do texto do rodapé a partir da base da página (dentro da faixa reservada)
const RODAPE_TEXTO = "Rua Hipólito Piva, 30, Centro, Monte Mor - SP, CEP 13190-093 | (19) 3217-7899";

export function safe(v: unknown): string {
  return (v == null ? "" : String(v)).replace(/[–—]/g, "-").replace(/[^\x20-\xFF]/g, " ").trim();
}

// Quebra texto em linhas que cabem em `width` — pdf-lib não quebra linha sozinho
// (drawText desenha reto, estourando a largura se o texto for maior que o espaço
// disponível). Usado tanto por paragraph() (texto corrido) quanto por formField()
// (valores de campo que podem ser mais longos que a coluna, ex: horário de trabalho
// colando no campo vizinho de um formFieldRow).
function quebrarLinhas(text: string, font: PDFFont, size: number, width: number): string[] {
  const palavras = safe(text).split(" ");
  const linhas: string[] = [];
  let linha = "";
  for (const palavra of palavras) {
    const tentativa = linha ? `${linha} ${palavra}` : palavra;
    if (linha && font.widthOfTextAtSize(tentativa, size) > width) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = tentativa;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

// Encapsula o cursor de escrita (página atual + posição Y) usado em todos os PDFs
// gerados no projeto — extraído do que já existia (duplicado) em gerar-pdf/route.ts,
// pra ser reaproveitado tanto ali quanto nos templates novos da Fase E.
export class PdfWriter {
  doc: PDFDocument;
  bold!: PDFFont;
  regular!: PDFFont;
  page!: PDFPage;
  logo: PDFImage | null = null;
  y = 0;

  private constructor(doc: PDFDocument) {
    this.doc = doc;
  }

  // criarPaginaInicial=false pula a criação automática da primeira página — usar
  // quando o primeiro conteúdo desenhado já for iniciado por uma função que chama
  // newPage() sozinha (ex: os templates de desenharFichaCadastral/etc., que sempre
  // abrem página própria). Deixar o default true preserva o comportamento de quem
  // já desenha direto em w.page logo após o create() (ex: a capa do pacote).
  static async create(doc: PDFDocument, criarPaginaInicial = true): Promise<PdfWriter> {
    const w = new PdfWriter(doc);
    w.bold = await doc.embedFont(StandardFonts.HelveticaBold);
    w.regular = await doc.embedFont(StandardFonts.Helvetica);
    // Falha ao ler/embutir o logo não pode derrubar a geração do PDF inteiro — loga um
    // warning e segue sem logo (drawHeader() já lida com w.logo === null).
    try {
      const logoPath = path.join(process.cwd(), "public", "Salmazos logo Preto.png");
      const logoBytes = fs.readFileSync(logoPath);
      w.logo = await doc.embedPng(logoBytes);
    } catch (err) {
      console.warn("[PdfWriter] Não foi possível carregar o logo:", err);
    }
    if (criarPaginaInicial) w.newPage();
    return w;
  }

  newPage() {
    this.page = this.doc.addPage(PageSizes.A4);
    this.drawHeader();
    this.drawFooter();
    this.y = PH - HEADER_RESERVED;
  }

  private drawHeader() {
    if (!this.logo) return;
    const scale = LOGO_H / this.logo.height;
    const logoW = this.logo.width * scale;
    this.page.drawImage(this.logo, { x: PW - ML - logoW, y: PH - 20 - LOGO_H, width: logoW, height: LOGO_H });
  }

  private drawFooter() {
    const size = 8;
    const textWidth = this.regular.widthOfTextAtSize(RODAPE_TEXTO, size);
    this.page.drawText(RODAPE_TEXTO, { x: (PW - textWidth) / 2, y: FOOTER_TEXT_Y, size, font: this.regular, color: GRAY });
  }

  ensureSpace(needed: number) {
    if (this.y - needed < FOOTER_RESERVED) this.newPage();
  }

  drawText(text: string, font: PDFFont, size: number, color = DARK, x = ML) {
    this.ensureSpace(size + 4);
    this.page.drawText(safe(text), { x, y: this.y, size, font, color });
    this.y -= size + 4;
  }

  // Label + valor numa linha só — usado nas páginas de resumo (esconde o campo se vazio).
  drawField(label: string, value: unknown) {
    const v = safe(value);
    if (!v) return;
    this.ensureSpace(14);
    this.page.drawText(`${label}:`, { x: ML, y: this.y, size: 9, font: this.bold, color: GRAY });
    this.page.drawText(v, { x: ML + 140, y: this.y, size: 9, font: this.regular, color: DARK });
    this.y -= 14;
  }

  sectionTitle(text: string) {
    this.y -= 6;
    this.ensureSpace(30);
    this.page.drawRectangle({ x: ML, y: this.y - 22, width: CW, height: 22, color: BLACK });
    this.page.drawText(text, { x: ML + 8, y: this.y - 16, size: 11, font: this.bold, color: YELLOW });
    this.y -= 32;
  }

  // Campo de formulário de verdade: rótulo em cima, valor OU linha em branco embaixo
  // pra preencher à caneta — usado nos 3 documentos da Fase E (sempre desenha o rótulo,
  // preenchido ou não, ao contrário de drawField que some se vazio). Valores mais longos
  // que `width` quebram em várias linhas em vez de estourar por cima do campo vizinho
  // (era o caso de "Horário de trabalho" colando em "Data de admissão").
  formField(label: string, value: unknown, width: number = CW, x: number = ML) {
    const v = safe(value);
    this.ensureSpace(28);
    this.page.drawText(label, { x, y: this.y, size: 8, font: this.bold, color: GRAY });
    this.y -= 12;
    if (v) {
      const linhas = quebrarLinhas(v, this.regular, 10, width);
      for (const linha of linhas) {
        this.ensureSpace(12);
        this.page.drawText(linha, { x, y: this.y, size: 10, font: this.regular, color: DARK });
        this.y -= 12;
      }
      this.y -= 4;
    } else {
      this.page.drawLine({ start: { x, y: this.y - 1 }, end: { x: x + width, y: this.y - 1 }, thickness: 0.5, color: LIGHT_GRAY });
      this.y -= 16;
    }
  }

  // Duas colunas de formField lado a lado, na mesma linha.
  formFieldRow(fields: { label: string; value: unknown; width?: number }[]) {
    this.ensureSpace(28);
    const startY = this.y;
    const colWidth = CW / fields.length - 10;
    let x = ML;
    let maxDrop = 0;
    for (const f of fields) {
      this.y = startY;
      this.formField(f.label, f.value, f.width ?? colWidth, x);
      maxDrop = Math.max(maxDrop, startY - this.y);
      x += colWidth + 10;
    }
    this.y = startY - maxDrop;
  }

  // Quebra texto longo em várias linhas que cabem em `width` — usado pra declarações
  // de texto corrido (ex: cláusulas legais) em vez de cada chamador ter que quebrar a
  // mão feito foi feito na Autorização Sindical.
  paragraph(text: string, font: PDFFont, size: number, color = DARK, x: number = ML, width: number = CW) {
    for (const linha of quebrarLinhas(text, font, size, width)) {
      this.drawText(linha, font, size, color, x);
    }
  }

  // ( ) ou (X) — pra opções de múltipla escolha (rádio) desenhadas manualmente.
  checkOption(label: string, checked: boolean) {
    this.ensureSpace(16);
    this.page.drawText(checked ? "(X)" : "( )", { x: ML, y: this.y, size: 10, font: this.bold, color: DARK });
    this.page.drawText(label, { x: ML + 24, y: this.y, size: 10, font: this.regular, color: DARK });
    this.y -= 18;
  }

  // Linha reservada pra assinatura manual — nunca preenchida nesta fase (fica pra
  // integração futura de assinatura eletrônica ou assinatura física sobre o PDF impresso).
  // dataLabel permite trocar o "Data" genérico por algo como "Monte Mor, ___ de ___ de 20___"
  // sem afetar os documentos que já usam o rótulo padrão.
  signatureLine(label: string, dataLabel: string = "Data") {
    this.y -= 20;
    this.ensureSpace(50);
    this.page.drawLine({ start: { x: ML, y: this.y }, end: { x: ML + 260, y: this.y }, thickness: 0.8, color: DARK });
    this.y -= 12;
    this.page.drawText(label, { x: ML, y: this.y, size: 9, font: this.regular, color: GRAY });
    this.y -= 24;
    this.page.drawLine({ start: { x: ML, y: this.y }, end: { x: ML + 260, y: this.y }, thickness: 0.8, color: DARK });
    this.y -= 12;
    this.page.drawText(dataLabel, { x: ML, y: this.y, size: 9, font: this.regular, color: GRAY });
    this.y -= 10;
  }
}
