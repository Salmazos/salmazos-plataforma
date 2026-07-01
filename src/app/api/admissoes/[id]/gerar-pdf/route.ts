import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PDFDocument, PDFPage, rgb, StandardFonts, PageSizes } from "pdf-lib";
import { registrarAuditoria } from "@/lib/audit";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import type { AdmissaoDadosPessoais, AdmissaoDependente, AdmissaoDocumento } from "@/types";

interface Params { params: Promise<{ id: string }> }

const PW = PageSizes.A4[0];
const PH = PageSizes.A4[1];
const ML = 50;
const CW = PW - ML * 2;

const BLACK = rgb(0, 0, 0);
const YELLOW = rgb(1, 0.843, 0);
const DARK = rgb(0.12, 0.14, 0.16);
const GRAY = rgb(0.43, 0.46, 0.50);

function safe(v: unknown): string {
  return (v == null ? "" : String(v)).replace(/[–—]/g, "-").replace(/[^\x20-\xFF]/g, " ").trim();
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: admissao, error: admError } = await svc
    .from("admissoes")
    .select("*, candidatos(nome_completo, cargo_pretendido), vagas(titulo)")
    .eq("id", id)
    .single();
  if (admError) return NextResponse.json({ error: admError.message }, { status: 404 });

  const [{ data: dadosPessoais }, { data: dependentes }, { data: documentos }] = await Promise.all([
    svc.from("admissao_dados_pessoais").select("*").eq("admissao_id", id).maybeSingle(),
    svc.from("admissao_dependentes").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
    svc.from("admissao_documentos").select("*").eq("admissao_id", id).order("created_at", { ascending: true }),
  ]);

  const dp = (dadosPessoais ?? {}) as Partial<AdmissaoDadosPessoais>;
  const deps = (dependentes ?? []) as AdmissaoDependente[];
  const docs = (documentos ?? []) as AdmissaoDocumento[];

  const obrigatoriosPendentes = docs.filter((d) => d.obrigatorio && d.status !== "aprovado");
  if (obrigatoriosPendentes.length > 0) {
    const labels = obrigatoriosPendentes.map(
      (d) => DOCUMENTOS_ADMISSAO.find((def) => def.tipo_documento === d.tipo_documento)?.label ?? d.tipo_documento
    );
    return NextResponse.json(
      {
        error: `Não é possível gerar o pacote: ${obrigatoriosPendentes.length} documento(s) obrigatório(s) ainda não foram aprovados: ${labels.join(", ")}`,
        pendentes: labels,
      },
      { status: 400 }
    );
  }

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  type Font = typeof bold;
  type Color = typeof BLACK;

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

  function drawField(label: string, value: unknown) {
    const v = safe(value);
    if (!v) return;
    ensureSpace(14);
    page.drawText(`${label}:`, { x: ML, y, size: 9, font: bold, color: GRAY });
    page.drawText(v, { x: ML + 140, y, size: 9, font: regular, color: DARK });
    y -= 14;
  }

  function sectionTitle(text: string) {
    y -= 6;
    ensureSpace(30);
    page.drawRectangle({ x: ML, y: y - 22, width: CW, height: 22, color: BLACK });
    page.drawText(text, { x: ML + 8, y: y - 16, size: 11, font: bold, color: YELLOW });
    y -= 32;
  }

  // ── Cover ──────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PH - 110, width: PW, height: 110, color: BLACK });
  page.drawText("SALMAZOS RH", { x: ML, y: PH - 52, size: 30, font: bold, color: YELLOW });
  page.drawText("Pacote de Admissão", { x: ML, y: PH - 75, size: 11, font: regular, color: YELLOW });
  y = PH - 140;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatoNome = (admissao.candidatos as any)?.nome_completo ?? dp.nome_completo ?? "—";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vagaTitulo = (admissao.vagas as any)?.titulo ?? "—";
  drawText(candidatoNome, bold, 20, DARK);
  drawField("Vaga", vagaTitulo);
  drawField("Modalidade", admissao.modalidade === "MOT" ? "Mão de Obra Temporária" : "Terceirização");
  drawField("Data de geração", new Date().toLocaleDateString("pt-BR"));

  // ── Dados pessoais ─────────────────────────────────────────
  sectionTitle("Dados Pessoais");
  drawField("Nome completo", dp.nome_completo);
  drawField("Data de nascimento", dp.data_nascimento);
  drawField("Sexo", dp.sexo === "M" ? "Masculino" : dp.sexo === "F" ? "Feminino" : "");
  drawField("Estado civil", dp.estado_civil);
  drawField("Nacionalidade", dp.nacionalidade);
  drawField("Naturalidade", dp.naturalidade);
  drawField("CPF", dp.cpf);
  drawField("RG", [dp.rg_numero, dp.rg_orgao_emissor, dp.rg_uf].filter(Boolean).join(" / "));
  drawField("RG - Data emissão", dp.rg_data_emissao);
  drawField("Nome da mãe", dp.nome_mae);
  drawField("Nome do pai", dp.nome_pai);
  drawField("Grau de instrução", dp.grau_instrucao);

  // ── Documentos profissionais ───────────────────────────────
  sectionTitle("Documentos Profissionais");
  drawField("PIS/PASEP", dp.pis_pasep);
  drawField("CTPS", [dp.carteira_trabalho_numero, dp.carteira_trabalho_serie, dp.carteira_trabalho_uf].filter(Boolean).join(" / "));
  drawField("Título de eleitor", dp.titulo_eleitor);
  drawField("Zona / Seção eleitoral", [dp.zona_eleitoral, dp.secao_eleitoral].filter(Boolean).join(" / "));
  drawField("Reservista", dp.reservista);
  drawField("CNH", dp.cnh_numero ? `${dp.cnh_numero} — Cat. ${dp.cnh_categoria ?? "—"} — Val. ${dp.cnh_validade ?? "—"}` : "");

  // ── Endereço e contato ─────────────────────────────────────
  sectionTitle("Endereço e Contato");
  drawField("CEP", dp.endereco_cep);
  drawField("Logradouro", [dp.endereco_logradouro, dp.endereco_numero, dp.endereco_complemento].filter(Boolean).join(", "));
  drawField("Bairro / Cidade / UF", [dp.endereco_bairro, dp.endereco_cidade, dp.endereco_uf].filter(Boolean).join(" / "));
  drawField("Telefone", dp.telefone);
  drawField("E-mail", dp.email);

  // ── Dados bancários ────────────────────────────────────────
  sectionTitle("Dados Bancários");
  drawField("Banco", dp.banco);
  drawField("Agência", dp.agencia);
  drawField("Conta", dp.conta);
  drawField("Tipo de conta", dp.tipo_conta === "corrente" ? "Conta Corrente" : dp.tipo_conta === "poupanca" ? "Conta Poupança" : "");

  // ── Dependentes ────────────────────────────────────────────
  if (deps.length > 0) {
    sectionTitle("Dependentes");
    for (const d of deps) {
      drawText(`${d.nome} (${d.parentesco ?? "—"})`, bold, 10, DARK);
      drawField("Data de nascimento", d.data_nascimento);
      drawField("CPF", d.cpf);
      if (d.nome_mae) drawField("Nome da mãe", d.nome_mae);
      y -= 6;
    }
  }

  // ── Documentos anexados (imagens/PDFs incorporados) ─────────
  const naoEmbutidos: string[] = [];
  for (const doc of docs) {
    if (!doc.storage_path) continue;
    const label = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === doc.tipo_documento)?.label ?? doc.tipo_documento;

    const { data: fileBlob, error: dlError } = await svc.storage.from("admissao-docs").download(doc.storage_path);
    if (dlError || !fileBlob) { naoEmbutidos.push(label); continue; }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const ext = doc.storage_path.split(".").pop()?.toLowerCase() ?? "";

    try {
      if (ext === "jpg" || ext === "jpeg") {
        const img = await pdfDoc.embedJpg(bytes);
        const docPage = pdfDoc.addPage(PageSizes.A4);
        docPage.drawText(label, { x: ML, y: PH - ML, size: 12, font: bold, color: DARK });
        const scale = Math.min((PW - ML * 2) / img.width, (PH - ML * 2 - 30) / img.height, 1);
        docPage.drawImage(img, { x: ML, y: ML, width: img.width * scale, height: img.height * scale });
      } else if (ext === "png") {
        const img = await pdfDoc.embedPng(bytes);
        const docPage = pdfDoc.addPage(PageSizes.A4);
        docPage.drawText(label, { x: ML, y: PH - ML, size: 12, font: bold, color: DARK });
        const scale = Math.min((PW - ML * 2) / img.width, (PH - ML * 2 - 30) / img.height, 1);
        docPage.drawImage(img, { x: ML, y: ML, width: img.width * scale, height: img.height * scale });
      } else if (ext === "pdf") {
        const subDoc = await PDFDocument.load(bytes);
        const copiedPages = await pdfDoc.copyPages(subDoc, subDoc.getPageIndices());
        copiedPages.forEach((p) => pdfDoc.addPage(p));
      } else {
        // HEIC e outros formatos não suportados nativamente pelo pdf-lib
        naoEmbutidos.push(label);
      }
    } catch {
      naoEmbutidos.push(label);
    }
  }

  if (naoEmbutidos.length > 0) {
    newPage();
    drawText("Documentos não incorporados automaticamente", bold, 12, DARK);
    drawText("(formato não suportado — baixe o arquivo original no painel)", regular, 9, GRAY);
    y -= 6;
    for (const label of naoEmbutidos) drawText(`• ${label}`, regular, 10, DARK);
  }

  const pdfBytes = await pdfDoc.save();

  const uploadPath = `pacotes-contabilidade/${id}/pacote-${Date.now()}.pdf`;
  const { error: uploadError } = await svc.storage
    .from("admissao-docs")
    .upload(uploadPath, Buffer.from(pdfBytes), { contentType: "application/pdf" });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const geradoEm = new Date().toISOString();
  await svc
    .from("admissoes")
    .update({
      status: "enviado_contabilidade",
      pdf_pacote_path: uploadPath,
      pdf_pacote_gerado_em: geradoEm,
      pdf_pacote_gerado_por: user.id,
    })
    .eq("id", id);

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_pacote_gerado",
    entidade: "admissoes",
    entidade_id: id,
    detalhes: { storage_path: uploadPath, documentos_nao_incorporados: naoEmbutidos },
  });

  const slug = safe(candidatoNome).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50);

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="admissao-${slug}.pdf"`,
      "Content-Length": String(pdfBytes.length),
    },
  });
}
