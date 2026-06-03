import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PDFDocument, PDFPage, rgb, StandardFonts, PageSizes } from "pdf-lib";

interface Params { params: Promise<{ id: string }> }

const PW = PageSizes.A4[0]; // 595.28
const PH = PageSizes.A4[1]; // 841.89
const ML = 50;
const CW = PW - ML * 2;

const BLACK  = rgb(0, 0, 0);
const YELLOW = rgb(1, 0.843, 0);
const DARK   = rgb(0.12, 0.14, 0.16);
const GRAY   = rgb(0.43, 0.46, 0.50);
const LGRAY  = rgb(0.85, 0.85, 0.87);

// Sanitize text: replace typographic chars above Latin-1 range
function safe(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replace(/[–—]/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\x00-\xFF]/g, "");
}

// If end year is before start year, replace any duration parenthetical with a warning
function validarPeriodo(periodo: string): string {
  const years = periodo.match(/\d{4}/g)?.map(Number) ?? [];
  if (years.length >= 2 && !/(atual|presente)/i.test(periodo) && years[1] < years[0]) {
    return periodo.replace(/\s*\([^)]*\)/, "") + " (datas a verificar)";
  }
  return periodo;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: vagaId } = await params;
  const supabase = createServiceClient();

  const [{ data: vaga }, { data: cvRows }] = await Promise.all([
    supabase
      .from("vagas")
      .select("titulo, status, cidade, estado, requisitos, clientes(nome)")
      .eq("id", vagaId)
      .single(),
    supabase
      .from("candidatos_vagas")
      .select(
        "match_score, match_detalhes, etapa, candidatos(nome_completo, cargo_pretendido, cidade, estado, idade, formacao_academica, resumo_candidato, resumo_profissional, habilidades, experiencias_profissionais)"
      )
      .eq("vaga_id", vagaId)
      .order("match_score", { ascending: false, nullsFirst: false }),
  ]);

  if (!vaga) return NextResponse.json({ error: "Vaga nao encontrada" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatos = (cvRows ?? []).map((cv: any) => ({
    ...(cv.candidatos ?? {}),
    match_score: cv.match_score,
    match_detalhes: cv.match_detalhes,
  }));

  const pdfDoc = await PDFDocument.create();
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  type Font  = typeof bold;
  type Color = typeof BLACK;

  function wrapText(text: string, font: Font, size: number, maxW: number): string[] {
    const words = safe(text).split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── COVER PAGE — must be added first so it is page 1 in the document ─────────
  const cover = pdfDoc.addPage(PageSizes.A4);

  cover.drawRectangle({ x: 0, y: PH - 110, width: PW, height: 110, color: BLACK });
  cover.drawText("SALMAZOS RH", { x: ML, y: PH - 52, size: 30, font: bold, color: YELLOW });
  cover.drawText("Plataforma de Recrutamento & Selecao", {
    x: ML, y: PH - 75, size: 11, font: regular, color: YELLOW,
  });

  let cy = PH - 140;
  cover.drawText("Relatorio de Candidatos", { x: ML, y: cy, size: 12, font: regular, color: GRAY });
  cy -= 40;

  for (const line of wrapText(vaga.titulo ?? "", bold, 22, CW)) {
    cover.drawText(line, { x: ML, y: cy, size: 22, font: bold, color: DARK });
    cy -= 30;
  }
  cy -= 8;

  cover.drawLine({ start: { x: ML, y: cy }, end: { x: PW - ML, y: cy }, thickness: 2, color: YELLOW });
  cy -= 30;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clienteNome = (vaga.clientes as any)?.nome ?? "Banco de Talentos";
  const meta: [string, string][] = [
    ["Cliente",              safe(clienteNome)],
    ["Local",                safe([vaga.cidade, vaga.estado].filter(Boolean).join(" / ") || "Nao informado")],
    ["Data de geracao",      new Date().toLocaleDateString("pt-BR")],
    ["Total de candidatos",  String(candidatos.length)],
  ];
  for (const [label, value] of meta) {
    cover.drawText(label, { x: ML, y: cy, size: 9, font: bold, color: GRAY });
    cy -= 16;
    cover.drawText(value, { x: ML, y: cy, size: 14, font: bold, color: DARK });
    cy -= 28;
  }

  // ── CANDIDATE PAGES — added after cover so they start at page 2 ──────────────
  let page: PDFPage = pdfDoc.addPage(PageSizes.A4);
  let y = PH - ML;

  function newPage() {
    page = pdfDoc.addPage(PageSizes.A4);
    y = PH - ML;
  }

  function ensureSpace(needed: number) {
    if (y - needed < ML + 20) newPage();
  }

  function drawText(text: string, font: Font, size: number, color: Color, x = ML) {
    ensureSpace(size + 4);
    page.drawText(safe(text), { x, y, size, font, color });
    y -= size + 4;
  }

  function drawWrapped(text: string, font: Font, size: number, color: Color, indent = 0) {
    for (const line of wrapText(text, font, size, CW - indent)) {
      ensureSpace(size + 4);
      page.drawText(line, { x: ML + indent, y, size, font, color });
      y -= size + 4;
    }
  }

  function drawDivider(color: Color = LGRAY, thickness = 0.5) {
    ensureSpace(12);
    page.drawLine({ start: { x: ML, y }, end: { x: PW - ML, y }, thickness, color });
    y -= 10;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candidatos.forEach((c: any, idx: number) => {
    if (!c?.nome_completo) return;

    if (idx > 0) {
      y -= 8;
      drawDivider(LGRAY, 1);
      y -= 6;
    }

    // Name bar
    const BAR_H = 28;
    ensureSpace(BAR_H + 30);
    page.drawRectangle({ x: ML, y: y - BAR_H, width: CW, height: BAR_H, color: BLACK });
    page.drawText(safe(c.nome_completo), {
      x: ML + 10, y: y - BAR_H + 9,
      size: 13, font: bold, color: YELLOW,
    });
    y -= BAR_H + 8;

    // Info row
    const infoParts = [
      c.cargo_pretendido,
      [c.cidade, c.estado].filter(Boolean).join("/"),
      c.idade ? `${c.idade} anos` : null,
      c.formacao_academica,
    ].filter(Boolean);
    drawText(safe(infoParts.join("  |  ")), regular, 9, GRAY);
    y -= 4;

    // Match score
    if (c.match_score != null) {
      const score = c.match_score as number;
      const label = score >= 80 ? "Excelente" : score >= 60 ? "Bom" : score >= 40 ? "Regular" : "Baixo";
      const scoreColor = score >= 80 ? rgb(0.13, 0.77, 0.37)
        : score >= 60 ? rgb(1, 0.75, 0)
        : score >= 40 ? rgb(0.98, 0.45, 0.09)
        : rgb(0.61, 0.64, 0.69);
      drawText(`Match: ${score}% - ${label}`, bold, 10, scoreColor);
      if (c.match_detalhes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = c.match_detalhes as any;
        drawText(
          `Cargo: ${d.cargo_match}%  |  Habilidades: ${d.habilidades_match}%  |  Localizacao: ${d.localizacao_match}%  |  Experiencia: ${d.experiencia_match}%`,
          regular, 8, GRAY
        );
      }
      y -= 4;
    }

    // Resumo do candidato — rendered as-is; durations already injected by calcularDuracaoResumo
    if (c.resumo_candidato) {
      drawText("Resumo do Candidato", bold, 9, DARK);
      drawWrapped(c.resumo_candidato, regular, 9, GRAY);
      y -= 4;
    }

    // Analise IA — rendered as-is; no additional duration processing
    if (c.resumo_profissional) {
      drawText("Analise da IA", bold, 9, DARK);
      drawWrapped(c.resumo_profissional, regular, 9, GRAY);
      y -= 4;
    }

    // Experiencias — show empresa, cargo, periodo (already contains duration), descricao
    // NOTE: exp.duracao is intentionally NOT rendered; it is already embedded in exp.periodo
    if (c.experiencias_profissionais) {
      drawText("Experiencias Profissionais", bold, 9, DARK);
      const parts = String(c.experiencias_profissionais).split(/\|\s*(?=\{)/);
      for (const part of parts) {
        const txt = part.trim();
        if (!txt) continue;
        try {
          const exp = JSON.parse(txt);
          if (exp?.empresa) {
            const header = [exp.empresa, exp.cargo].filter(Boolean).join(" - ");
            drawText(header, bold, 9, DARK);
            if (exp.periodo) {
              drawText(safe(validarPeriodo(exp.periodo)), regular, 8, GRAY);
            }
            if (exp.descricao) drawWrapped(exp.descricao, regular, 8, GRAY, 8);
            y -= 2;
            continue;
          }
        } catch { /* fall through */ }
        drawWrapped(txt, regular, 8, GRAY);
      }
      y -= 4;
    }

    // Habilidades
    if (Array.isArray(c.habilidades) && c.habilidades.length > 0) {
      drawText("Habilidades", bold, 9, DARK);
      drawWrapped((c.habilidades as string[]).join(", "), regular, 9, GRAY);
      y -= 4;
    }
  });

  const bytes = await pdfDoc.save();
  const slugTitle = safe(vaga.titulo ?? "relatorio")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50);

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-${slugTitle}.pdf"`,
      "Content-Length": String(bytes.length),
    },
  });
}
