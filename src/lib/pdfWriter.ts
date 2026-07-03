import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, PageSizes } from "pdf-lib";

export const PW = PageSizes.A4[0];
export const PH = PageSizes.A4[1];
export const ML = 50;
export const CW = PW - ML * 2;

export const BLACK = rgb(0, 0, 0);
export const YELLOW = rgb(1, 0.843, 0);
export const DARK = rgb(0.12, 0.14, 0.16);
export const GRAY = rgb(0.43, 0.46, 0.50);
export const LIGHT_GRAY = rgb(0.7, 0.72, 0.75);

export function safe(v: unknown): string {
  return (v == null ? "" : String(v)).replace(/[–—]/g, "-").replace(/[^\x20-\xFF]/g, " ").trim();
}

// Encapsula o cursor de escrita (página atual + posição Y) usado em todos os PDFs
// gerados no projeto — extraído do que já existia (duplicado) em gerar-pdf/route.ts,
// pra ser reaproveitado tanto ali quanto nos templates novos da Fase E.
export class PdfWriter {
  doc: PDFDocument;
  bold!: PDFFont;
  regular!: PDFFont;
  page!: PDFPage;
  y = 0;

  private constructor(doc: PDFDocument) {
    this.doc = doc;
  }

  static async create(doc: PDFDocument): Promise<PdfWriter> {
    const w = new PdfWriter(doc);
    w.bold = await doc.embedFont(StandardFonts.HelveticaBold);
    w.regular = await doc.embedFont(StandardFonts.Helvetica);
    w.newPage();
    return w;
  }

  newPage() {
    this.page = this.doc.addPage(PageSizes.A4);
    this.y = PH - ML;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < ML + 20) this.newPage();
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
  // preenchido ou não, ao contrário de drawField que some se vazio).
  formField(label: string, value: unknown, width: number = CW, x: number = ML) {
    const v = safe(value);
    this.ensureSpace(28);
    this.page.drawText(label, { x, y: this.y, size: 8, font: this.bold, color: GRAY });
    this.y -= 12;
    if (v) {
      this.page.drawText(v, { x, y: this.y, size: 10, font: this.regular, color: DARK });
    } else {
      this.page.drawLine({ start: { x, y: this.y - 1 }, end: { x: x + width, y: this.y - 1 }, thickness: 0.5, color: LIGHT_GRAY });
    }
    this.y -= 16;
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

  // ( ) ou (X) — pra opções de múltipla escolha (rádio) desenhadas manualmente.
  checkOption(label: string, checked: boolean) {
    this.ensureSpace(16);
    this.page.drawText(checked ? "(X)" : "( )", { x: ML, y: this.y, size: 10, font: this.bold, color: DARK });
    this.page.drawText(label, { x: ML + 24, y: this.y, size: 10, font: this.regular, color: DARK });
    this.y -= 18;
  }

  // Linha reservada pra assinatura manual — nunca preenchida nesta fase (fica pra
  // integração futura de assinatura eletrônica ou assinatura física sobre o PDF impresso).
  signatureLine(label: string) {
    this.y -= 20;
    this.ensureSpace(50);
    this.page.drawLine({ start: { x: ML, y: this.y }, end: { x: ML + 260, y: this.y }, thickness: 0.8, color: DARK });
    this.y -= 12;
    this.page.drawText(label, { x: ML, y: this.y, size: 9, font: this.regular, color: GRAY });
    this.y -= 24;
    this.page.drawLine({ start: { x: ML, y: this.y }, end: { x: ML + 150, y: this.y }, thickness: 0.8, color: DARK });
    this.y -= 12;
    this.page.drawText("Data", { x: ML, y: this.y, size: 9, font: this.regular, color: GRAY });
    this.y -= 10;
  }
}
