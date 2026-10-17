// Verificação da ordem/índice/bookmarks do pacote da contabilidade (src/lib/pacoteOrdem.ts) —
// o projeto não tem runner de testes. Não toca produção: PDFs e imagens sintéticos, sem Supabase.
// Rodar: node --no-warnings --import ./scripts/harness-mot/register.mjs scripts/verificar-pacote-ordem.mts
import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { PdfWriter } from "@/lib/pdfWriter";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import {
  ordenarDocumentosPacote, timestampDoStoragePath, rotularDocumentos, anexarDocumentosAoPacote,
  inserirIndiceEBookmarks, contarPaginasIndice, ROTULO_RG_FRENTE_E_VERSO, type DocumentoOrdenavel,
} from "@/lib/pacoteOrdem";

const ORDEM = DOCUMENTOS_ADMISSAO.map((d) => d.tipo_documento);
const LABEL = (t: string) => DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === t)?.label ?? t;
const SEED = "2026-10-16T19:22:59.467646+00:00";
let n = 0;
const doc = (tipo: string, ts: number | null, extra: Partial<DocumentoOrdenavel> = {}, ext = "jpg"): DocumentoOrdenavel => ({
  id: `id-${String(++n).padStart(4, "0")}`,
  tipo_documento: tipo,
  storage_path: ts === null ? `adm/${tipo}/arquivo-sem-timestamp.${ext}` : `adm/${tipo}/${ts}-arq.${ext}`,
  created_at: SEED,
  ...extra,
});
let ok = 0;
const passa = (nome: string) => { ok++; console.log(`  ok  ${nome}`); };

// ── 1. Ordem ───────────────────────────────────────────────────────────────
{
  const docs = [
    doc("foto_3x4", 5), doc("rg_verso", 4), doc("tipo_inventado_b", 1), doc("rg", 3), doc("ctps_todas_paginas", 2),
    doc("certidao_nascimento_filho", 900), doc("tipo_inventado_a", 7), doc("cpf", 1), doc("certidao_nascimento_filho", 100),
  ];
  const esperado = ["ctps_todas_paginas", "cpf", "rg", "rg_verso", "certidao_nascimento_filho", "certidao_nascimento_filho", "foto_3x4", "tipo_inventado_a", "tipo_inventado_b"];
  const saida = ordenarDocumentosPacote(docs, ORDEM);
  assert.deepEqual(saida.map((d) => d.tipo_documento), esperado);
  assert.equal(saida.length, docs.length, "nenhum documento descartado");
  passa("ordem do array; rg antes de rg_verso; desconhecidos no fim (nunca descartados)");

  // desempate por timestamp do path dentro do tipo (created_at idêntico)
  const certs = saida.filter((d) => d.tipo_documento === "certidao_nascimento_filho");
  assert.deepEqual(certs.map((d) => timestampDoStoragePath(d.storage_path)), [100, 900]);
  passa("empate de created_at desfeito pelo timestamp do storage_path");

  // determinismo: qualquer permutação da entrada dá a mesma saída
  const ref = JSON.stringify(saida.map((d) => d.id));
  for (let i = 0; i < 200; i++) {
    const emb = [...docs].sort(() => Math.random() - 0.5);
    assert.equal(JSON.stringify(ordenarDocumentosPacote(emb, ORDEM).map((d) => d.id)), ref);
  }
  passa("determinístico em 200 permutações da entrada");

  // fallback: sem timestamp vai depois dos com timestamp; depois created_at; depois id
  const a = doc("cpf", null, { created_at: "2026-10-16T20:00:00.000000+00:00" });
  const b = doc("cpf", null, { created_at: "2026-10-16T19:00:00.000000+00:00" });
  const c = doc("cpf", 50);
  const d1 = doc("cpf", null, { created_at: "2026-10-16T19:00:00.000000+00:00" });
  assert.deepEqual(ordenarDocumentosPacote([a, b, d1, c], ORDEM).map((d) => d.id), [c.id, b.id, d1.id, a.id]);
  passa("fallback: timestamp > sem timestamp; created_at; id");

  assert.equal(timestampDoStoragePath("x/y/123-a-b.jpg"), 123);
  assert.equal(timestampDoStoragePath("x/y/abc.jpg"), null);
  assert.equal(timestampDoStoragePath(null), null);
  passa("timestampDoStoragePath");
}

// ── 2. Numeração ───────────────────────────────────────────────────────────
{
  const docs = ordenarDocumentosPacote(
    [doc("certidao_nascimento_filho", 2), doc("certidao_nascimento_filho", 1), doc("cpf", 1), doc("cpf_dependentes", 1)], ORDEM);
  assert.deepEqual(rotularDocumentos(docs, LABEL), [
    "CPF/CIC", "Certidão de Nascimento do(s) filho(s) (1)", "Certidão de Nascimento do(s) filho(s) (2)", "CPF dos dependentes",
  ]);
  passa("numeração (1)(2) só em tipo com 2+ arquivos, na ordem de upload");
}

// ── Utilitários de PDF sintético ───────────────────────────────────────────
async function png(cor: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: cor, g: 0, b: 0 } } }).png().toBuffer());
}
async function pdfComPaginas(k: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < k; i++) d.addPage([200, 200]);
  return d.save();
}
function textoDaPagina(pdf: PDFDocument, idx: number): string {
  const conteudo = pdf.getPage(idx).node.Contents();
  const streams = conteudo instanceof PDFArray ? conteudo.asArray().map((r) => pdf.context.lookup(r)) : [conteudo];
  const bruto = streams.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") : "")).join("\n");
  // pdf-lib grava o texto como string hexadecimal (<48656c6c6f> Tj) — converte para "(texto)".
  return bruto.replace(/<([0-9A-Fa-f]+)>\s*Tj/g, (_m, hex: string) => `(${Buffer.from(hex, "hex").toString("latin1")}) Tj`);
}
function bookmarksDoPdf(pdf: PDFDocument): { titulo: string; pagina: number }[] {
  const cat = pdf.catalog;
  const raiz = pdf.context.lookup(cat.get(PDFName.of("Outlines")), PDFDict);
  const ordemPaginas = pdf.getPages().map((p) => p.ref.toString());
  const saida: { titulo: string; pagina: number }[] = [];
  let ref = raiz.get(PDFName.of("First")) as PDFRef | undefined;
  while (ref) {
    const item = pdf.context.lookup(ref, PDFDict);
    const dest = item.lookup(PDFName.of("Dest"), PDFArray);
    saida.push({ titulo: (item.lookup(PDFName.of("Title")) as unknown as { decodeText(): string }).decodeText(), pagina: ordemPaginas.indexOf((dest.get(0) as PDFRef).toString()) + 1 });
    ref = item.get(PDFName.of("Next")) as PDFRef | undefined;
  }
  assert.equal(Number((raiz.get(PDFName.of("Count")) as unknown as { asNumber(): number }).asNumber()), saida.length);
  return saida;
}

type Fonte = Record<string, Uint8Array | null>;
const downloads: string[] = [];
async function montar(docs: DocumentoOrdenavel[], fonte: Fonte, paginasGeradas = 3) {
  downloads.length = 0;
  const pdfDoc = await PDFDocument.create();
  const w = await PdfWriter.create(pdfDoc);
  for (let i = 1; i < paginasGeradas; i++) w.newPage(); // simula capa + páginas geradas
  const r = await anexarDocumentosAoPacote({
    pdfDoc, w, admissaoId: "ADM-1", docs: ordenarDocumentosPacote(docs, ORDEM).filter((d) => d.storage_path), labelPorTipo: LABEL,
    baixar: async (p) => { downloads.push(p); return fonte[p] ?? null; },
  });
  if (r.naoEmbutidos.length > 0) { w.newPage(); w.drawText("nao incorporados", w.bold, 12); }
  await inserirIndiceEBookmarks(pdfDoc, w, r);
  const salvo = await pdfDoc.save();
  return { r, pdfDoc, reaberto: await PDFDocument.load(salvo) };
}

// ── 3. RG idêntico vs diferente ────────────────────────────────────────────
{
  const rg = doc("rg", 1), verso = doc("rg_verso", 1), cpf = doc("cpf", 1);
  const A = await png(200), B = await png(100);
  const igual = await montar([rg, verso, cpf], { [rg.storage_path!]: A, [verso.storage_path!]: A, [cpf.storage_path!]: B });
  assert.deepEqual(igual.r.entradas.map((e) => e.rotulo), ["CPF/CIC", ROTULO_RG_FRENTE_E_VERSO]);
  assert.equal(igual.r.entradas.length, 2, "uma linha só no índice");
  assert.equal(igual.reaberto.getPageCount(), 3 + 1 /* índice */ + 2, "rg embutido uma vez");
  assert.equal(downloads.length, 3, "RG idêntico: 3 downloads (rg, rg_verso, cpf), nenhum repetido");
  passa("RG idêntico (sha256) → embutido 1x, rótulo 'frente e verso', 1 linha no índice");

  const dif = await montar([rg, verso, cpf], { [rg.storage_path!]: A, [verso.storage_path!]: B, [cpf.storage_path!]: B });
  assert.deepEqual(dif.r.entradas.map((e) => e.rotulo), ["CPF/CIC", "Identidade RG (frente)", "Identidade RG (verso)"]);
  assert.equal(dif.reaberto.getPageCount(), 3 + 1 + 3);
  assert.equal(downloads.length, 3, "RG diferente: cada arquivo baixado uma única vez (bytes do hash reaproveitados)");
  assert.equal(new Set(downloads).size, 3);
  passa("RG diferente → comportamento atual (2 documentos), sem download duplicado");

  const semVerso = await montar([rg, cpf], { [rg.storage_path!]: A, [cpf.storage_path!]: B });
  assert.deepEqual(semVerso.r.entradas.map((e) => e.rotulo), ["CPF/CIC", "Identidade RG (frente)"]);
  passa("só rg (sem verso) → rótulo normal");
}

// ── 4. Falhas: motivo, log sem dado pessoal, seção 'não incorporado' ────────
{
  const heic = doc("cartao_sus", 1, {}, "heic"), ruim = doc("cpf", 1, {}, "pdf"), sumiu = doc("titulo_eleitor", 1), bom = doc("rg", 1);
  const logs: string[] = [];
  const orig = console.error; console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  let res;
  try {
    res = await montar([heic, ruim, sumiu, bom], {
      [heic.storage_path!]: new Uint8Array([1, 2, 3]), [ruim.storage_path!]: new Uint8Array([1, 2, 3]), [bom.storage_path!]: await png(10),
    });
  } finally { console.error = orig; }
  const motivos = Object.fromEntries(res.r.motivosNaoIncorporados.map((m) => [m.tipo_documento, m.motivo]));
  assert.equal(motivos.cartao_sus, "formato_nao_suportado");
  assert.equal(motivos.titulo_eleitor, "download_falhou");
  assert.match(motivos.cpf, /^erro_ao_embutir:/);
  assert.deepEqual(res.r.naoEmbutidos, ["CPF/CIC", "Título de Eleitor", "Cartão do SUS"].sort((a, b) => ORDEM.indexOf(DOCUMENTOS_ADMISSAO.find((d) => d.label === a)!.tipo_documento) - ORDEM.indexOf(DOCUMENTOS_ADMISSAO.find((d) => d.label === b)!.tipo_documento)));
  assert.ok(logs.some((l) => l.includes("admissao_id=ADM-1") && l.includes("tipo_documento=cpf") && /erro=\w+/.test(l)), "console.error com admissao_id, tipo e erro");
  assert.ok(logs.every((l) => !l.includes("arquivo-sem") && !l.includes("-arq.")), "log sem nome de arquivo");
  assert.equal(res.r.entradas.filter((e) => e.paginaInicial === null).length, 3);
  const txt = textoDaPagina(res.reaberto, 3); // 1ª página do índice (após 3 geradas)
  assert.equal((txt.match(/\(n\xe3o incorporado\) Tj/g) ?? []).length, 3, "3 linhas 'não incorporado' no índice");
  assert.ok(txt.includes("(N\xe3o incorporados automaticamente) Tj"));
  passa("motivos registrados, console.error sem nome de arquivo, 'não incorporado' no índice, ordem preservada");
}

// ── 5. Índice com várias páginas + páginas batendo + bookmarks ──────────────
{
  const docs: DocumentoOrdenavel[] = [];
  const fonte: Fonte = {};
  const cores = await Promise.all([10, 60, 110].map(png));
  const tipos = ["cpf", "titulo_eleitor", "cartao_sus", "certidao_civil", "pis_pasep", "comprovante_endereco"];
  for (let i = 0; i < 90; i++) {
    const tipo = i < 70 ? "certidao_nascimento_filho" : tipos[i % tipos.length];
    const ehPdf = i % 7 === 0;
    const d = doc(tipo, 1000 + i, {}, ehPdf ? "pdf" : "png");
    docs.push(d);
    fonte[d.storage_path!] = ehPdf ? await pdfComPaginas(1 + (i % 3)) : cores[i % 3];
  }
  const { r, reaberto } = await montar(docs, fonte, 4);
  const nIndice = await contarPaginasIndice(r.entradas);
  assert.ok(nIndice >= 2, `índice deve ter 2+ páginas (tem ${nIndice})`);

  // (a) páginas esperadas calculadas de forma independente: 4 geradas + N do índice + acumulado
  let esperado = 4 + nIndice + 1;
  const ordenados = ordenarDocumentosPacote(docs, ORDEM);
  r.entradas.forEach((e, i) => {
    assert.equal(e.paginaInicial, esperado, `entrada ${i} (${e.rotulo})`);
    const d = ordenados[i];
    esperado += d.storage_path!.endsWith(".pdf") ? 1 + (Number(d.storage_path!.split("/")[2].split("-")[0]) - 1000) % 3 : 1;
  });
  assert.equal(reaberto.getPageCount(), esperado - 1, "total de páginas do pacote");
  passa(`índice com ${nIndice} páginas; página inicial de cada um dos ${r.entradas.length} docs confere com cálculo independente`);

  // (b) bookmarks do PDF salvo apontam pra mesma página inicial
  const bm = bookmarksDoPdf(reaberto);
  assert.equal(bm.length, r.entradas.length);
  bm.forEach((b, i) => { assert.equal(b.pagina, r.entradas[i].paginaInicial); assert.equal(b.titulo, r.entradas[i].rotulo); });
  passa("bookmarks (outline) do PDF salvo/reaberto apontam para a página inicial de cada documento");

  // (c) o texto desenhado nas páginas do índice contém exatamente esses números, na ordem
  const numeros: number[] = [];
  for (let p = 4; p < 4 + nIndice; p++) for (const m of textoDaPagina(reaberto, p).matchAll(/\(p\. (\d+)\)/g)) numeros.push(Number(m[1]));
  assert.deepEqual(numeros, r.entradas.map((e) => e.paginaInicial));
  passa("números de página DESENHADOS no índice (lidos do content stream) batem com a página real");

  // (d) a página destino de cada bookmark imagem carrega o rótulo (cabeçalho numerado)
  const primeiraCert = r.entradas.find((e) => e.rotulo.endsWith("(1)") && ordenados[r.entradas.indexOf(e)].storage_path!.endsWith(".png"))!;
  assert.ok(textoDaPagina(reaberto, primeiraCert.paginaInicial! - 1).includes("(1)"));
  passa("cabeçalho da imagem usa o rótulo numerado");

  // (e) sem nada desenhado por cima de PDFs: página 1 de um PDF anexado só tem a cópia original
  const idxPdf = ordenados.findIndex((d) => d.storage_path!.endsWith(".pdf"));
  assert.equal(textoDaPagina(reaberto, r.entradas[idxPdf].paginaInicial! - 1).includes(r.entradas[idxPdf].rotulo), false);
  passa("nenhum carimbo sobre as páginas dos PDFs anexados");
}

// ── 6. Sem documentos → sem índice ─────────────────────────────────────────
{
  const { r, reaberto } = await montar([doc("cpf", null, { storage_path: null })], {});
  assert.equal(r.entradas.length, 0);
  assert.equal(reaberto.getPageCount(), 3);
  assert.equal(reaberto.catalog.get(PDFName.of("Outlines")), undefined);
  passa("sem documentos anexados: sem índice e sem outline");
}

console.log(`\n${ok} grupos de verificação OK`);
