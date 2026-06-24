import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PDFDocument, PDFPage, rgb, StandardFonts, PageSizes } from "pdf-lib";

const PW = PageSizes.A4[0];
const PH = PageSizes.A4[1];
const ML = 50;
const CW = PW - ML * 2;

const BLACK  = rgb(0, 0, 0);
const YELLOW = rgb(1, 0.843, 0);
const DARK   = rgb(0.12, 0.14, 0.16);
const GRAY   = rgb(0.43, 0.46, 0.50);
const LGRAY  = rgb(0.93, 0.93, 0.95);
const WHITE  = rgb(1, 1, 1);
const GREEN  = rgb(0.04, 0.59, 0.26);
const BLUE   = rgb(0.23, 0.51, 0.96);

const TIPO_LABELS: Record<string, string> = {
  visita_comercial: "Visita Comercial",
  visita_tecnica: "Visita Tecnica",
  treinamento: "Treinamento",
  outros: "Outros",
};

function safe(v: unknown): string {
  return (v == null ? "" : String(v))
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\xFF]/g, " ")
    .trim();
}

function fmtDate(d: string): string {
  return d.split("-").reverse().join("/");
}

function fmtCurrency(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

interface OutroCustoDB { tipo: string; descricao: string; valor: number; comprovante_url?: string }

interface Registro {
  id: string;
  analista_id: string;
  data: string;
  km_inicial: number;
  km_final: number;
  km_rodados: number;
  tipo_servico: string | null;
  valor_por_km: number | null;
  valor_total: number | null;
  outros_custos: OutroCustoDB[] | null;
}

interface Visita {
  registro_id: string;
  empresa: string;
  contato: string | null;
  motivo: string | null;
  resultado: string | null;
  ordem: number;
}

export async function POST(request: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await request.json();
  const { analista_id, analista_nome, from, to } = body as {
    analista_id?: string;
    analista_nome?: string;
    from?: string;
    to?: string;
  };

  const svc = createServiceClient();

  // ── Fetch registros ──
  let registros: Registro[] = [];

  if (analista_id) {
    let q = svc.from("km_registros").select("*").eq("analista_id", analista_id).order("data", { ascending: false });
    if (from) q = q.gte("data", from);
    if (to) q = q.lte("data", to);
    const { data } = await q;
    registros = (data ?? []) as Registro[];
  } else {
    const { data: analistas } = await svc.from("analistas_perfil").select("id").eq("ativo", true);
    const results = await Promise.all(
      (analistas ?? []).map(async (a) => {
        let q = svc.from("km_registros").select("*").eq("analista_id", a.id).order("data", { ascending: false });
        if (from) q = q.gte("data", from);
        if (to) q = q.lte("data", to);
        const { data } = await q;
        return (data ?? []) as Registro[];
      })
    );
    registros = results.flat().sort((a, b) => b.data.localeCompare(a.data));
  }

  // ── Fetch visitas for all registros ──
  const regIds = registros.map((r) => r.id);
  let visitas: Visita[] = [];
  if (regIds.length > 0) {
    const { data } = await svc
      .from("km_visitas")
      .select("registro_id, empresa, contato, motivo, resultado, ordem")
      .in("registro_id", regIds)
      .order("ordem", { ascending: true });
    visitas = (data ?? []) as Visita[];
  }
  const visitasByReg = new Map<string, Visita[]>();
  visitas.forEach((v) => {
    const arr = visitasByReg.get(v.registro_id) ?? [];
    arr.push(v);
    visitasByReg.set(v.registro_id, arr);
  });

  // ── Fetch analyst names for consolidated view ──
  const analistaNames = new Map<string, string>();
  if (!analista_id) {
    const ids = [...new Set(registros.map((r) => r.analista_id))];
    if (ids.length > 0) {
      const { data } = await svc.from("analistas_perfil").select("id, nome_completo").in("id", ids);
      (data ?? []).forEach((a) => analistaNames.set(a.id, a.nome_completo));
    }
  }

  // ── Totals ──
  const ocSum = (c: OutroCustoDB[] | null) => (c ?? []).reduce((s, x) => s + x.valor, 0);
  const totalKm = registros.reduce((s, r) => s + r.km_rodados, 0);
  const totalReembolso = registros.reduce((s, r) => s + (r.valor_total ?? 0), 0);
  const totalOutros = registros.reduce((s, r) => s + ocSum(r.outros_custos), 0);
  const totalGeral = totalReembolso + totalOutros;

  const isConsolidated = !analista_id;
  const periodoLabel = [from ? fmtDate(from) : "inicio", to ? fmtDate(to) : "hoje"].join(" a ");
  const nomeLabel = analista_nome ? safe(analista_nome) : "Consolidado - Todos os Funcionarios";
  const agora = new Date();
  const geradoEm = `${agora.toLocaleDateString("pt-BR")} as ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  // ── Build PDF ──
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  type Font = typeof bold;
  type Color = typeof BLACK;

  let page: PDFPage = doc.addPage(PageSizes.A4);
  let y = PH;

  function newPage() {
    page = doc.addPage(PageSizes.A4);
    y = PH - ML;
  }
  function ensure(h: number) { if (y - h < ML + 30) newPage(); }

  function drawText(text: string, x: number, yPos: number, font: Font, size: number, color: Color) {
    page.drawText(safe(text), { x, y: yPos, size, font, color });
  }

  function wrapText(text: string, font: Font, size: number, maxW: number): string[] {
    const words = safe(text).replace(/[\n\r\t]/g, " ").split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── HEADER ──
  page.drawRectangle({ x: 0, y: PH - 90, width: PW, height: 90, color: BLACK });
  drawText("SALMAZOS RH", ML, PH - 38, bold, 26, YELLOW);
  drawText("Plataforma de Gestao de RH & Servicos", ML, PH - 58, regular, 10, YELLOW);
  y = PH - 110;

  drawText("Relatorio de Reembolsos", ML, y, bold, 16, DARK); y -= 22;
  drawText(`Periodo: ${periodoLabel}`, ML, y, regular, 10, GRAY); y -= 16;
  drawText(nomeLabel, ML, y, bold, 11, DARK); y -= 16;
  drawText(`Gerado em: ${geradoEm}`, ML, y, regular, 9, GRAY); y -= 24;

  page.drawLine({ start: { x: ML, y }, end: { x: PW - ML, y }, thickness: 2, color: YELLOW }); y -= 20;

  // ── SUMMARY CARDS ──
  const cardW = (CW - 12) / 4;
  const cards = [
    { label: "Total KM", value: `${totalKm.toLocaleString("pt-BR")} km`, color: DARK },
    { label: "Reembolso KM", value: fmtCurrency(totalReembolso), color: GREEN },
    { label: "Outros Custos", value: fmtCurrency(totalOutros), color: BLUE },
    { label: "Total Geral", value: fmtCurrency(totalGeral), color: DARK },
  ];
  for (let i = 0; i < 4; i++) {
    const cx = ML + i * (cardW + 4);
    page.drawRectangle({ x: cx, y: y - 44, width: cardW, height: 44, color: LGRAY });
    drawText(cards[i].label, cx + 8, y - 14, bold, 7, GRAY);
    drawText(cards[i].value, cx + 8, y - 32, bold, 11, cards[i].color);
  }
  y -= 60;

  // ── TABLE ──
  const cols = isConsolidated
    ? [
        { label: "Data",       w: 52 },
        { label: "Analista",   w: 90 },
        { label: "Tipo",       w: 80 },
        { label: "KM Rod.",    w: 50, right: true },
        { label: "Reemb. KM",  w: 68, right: true },
        { label: "Outros",     w: 60, right: true },
        { label: "Total",      w: 68, right: true },
      ]
    : [
        { label: "Data",       w: 56 },
        { label: "Tipo",       w: 95 },
        { label: "KM Rod.",    w: 60, right: true },
        { label: "Reemb. KM",  w: 80, right: true },
        { label: "Outros",     w: 80, right: true },
        { label: "Total",      w: 80, right: true },
      ];

  const ROW_H = 18;
  const HDR_H = 22;

  function drawTableHeader() {
    ensure(HDR_H + ROW_H);
    page.drawRectangle({ x: ML, y: y - HDR_H, width: CW, height: HDR_H, color: BLACK });
    let cx = ML + 6;
    for (const col of cols) {
      const tx = col.right ? cx + col.w - 6 - bold.widthOfTextAtSize(col.label, 7) : cx;
      drawText(col.label, tx, y - HDR_H + 7, bold, 7, YELLOW);
      cx += col.w;
    }
    y -= HDR_H;
  }

  function drawRow(values: string[], isBold: boolean, bgColor?: typeof LGRAY) {
    ensure(ROW_H);
    if (bgColor) page.drawRectangle({ x: ML, y: y - ROW_H, width: CW, height: ROW_H, color: bgColor });
    const font = isBold ? bold : regular;
    let cx = ML + 6;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const text = safe(values[i] ?? "");
      const tx = col.right ? cx + col.w - 6 - font.widthOfTextAtSize(text, 8) : cx;
      drawText(text, tx, y - ROW_H + 5, font, 8, isBold ? DARK : GRAY);
      cx += col.w;
    }
    y -= ROW_H;
  }

  drawTableHeader();

  registros.forEach((r, idx) => {
    if (y - ROW_H < ML + 30) { newPage(); drawTableHeader(); }

    const oc = ocSum(r.outros_custos);
    const rowTotal = (r.valor_total ?? 0) + oc;
    const bg = idx % 2 === 0 ? undefined : LGRAY;
    const tipoLabel = TIPO_LABELS[r.tipo_servico ?? ""] ?? (r.tipo_servico ?? "-");

    const values = isConsolidated
      ? [fmtDate(r.data), analistaNames.get(r.analista_id) ?? "-", tipoLabel, String(r.km_rodados), fmtCurrency(r.valor_total ?? 0), oc > 0 ? fmtCurrency(oc) : "-", fmtCurrency(rowTotal)]
      : [fmtDate(r.data), tipoLabel, String(r.km_rodados), fmtCurrency(r.valor_total ?? 0), oc > 0 ? fmtCurrency(oc) : "-", fmtCurrency(rowTotal)];

    drawRow(values, false, bg);

    // Visitas below row
    const rv = visitasByReg.get(r.id);
    if (rv && rv.length > 0) {
      for (const v of rv) {
        ensure(14);
        const parts = [v.empresa, v.contato ? `Contato: ${v.contato}` : "", v.motivo ?? "", v.resultado ? `-> ${v.resultado}` : ""].filter(Boolean).join("  |  ");
        for (const line of wrapText(parts, regular, 7, CW - 20)) {
          ensure(12);
          drawText(line, ML + 16, y - 10, regular, 7, GRAY);
          y -= 12;
        }
      }
    }
  });

  // Totals row
  if (registros.length > 0) {
    page.drawLine({ start: { x: ML, y }, end: { x: PW - ML, y }, thickness: 1, color: DARK });
    const totValues = isConsolidated
      ? ["", "TOTAIS", "", String(totalKm), fmtCurrency(totalReembolso), fmtCurrency(totalOutros), fmtCurrency(totalGeral)]
      : ["TOTAIS", "", String(totalKm), fmtCurrency(totalReembolso), fmtCurrency(totalOutros), fmtCurrency(totalGeral)];
    drawRow(totValues, true);
  }

  // ── FOOTER ──
  y -= 20;
  ensure(30);
  page.drawLine({ start: { x: ML, y }, end: { x: PW - ML, y }, thickness: 0.5, color: LGRAY }); y -= 14;
  drawText(`Documento gerado em ${geradoEm}`, ML, y, regular, 8, GRAY); y -= 12;
  drawText("Salmazos RH & Servicos Terceirizados Ltda.", ML, y, regular, 8, GRAY);

  // ── Return ──
  const bytes = await doc.save();
  const slug = safe(analista_nome ?? "consolidado").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
  const periodo = [from ?? "inicio", to ?? "hoje"].join("_");
  const filename = `reembolsos_${slug}_${periodo}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
