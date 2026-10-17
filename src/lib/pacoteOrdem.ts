import { createHash } from "node:crypto";
import { PDFDocument, PDFHexString, PDFName, PDFPage, PageSizes } from "pdf-lib";
import { PdfWriter, PW, PH, ML, CW, safe, DARK, GRAY, LIGHT_GRAY, embutirImagemComprimida } from "@/lib/pdfWriter";

// Ordem, índice e bookmarks dos documentos do candidato dentro do pacote da contabilidade
// (gerar-pdf). A ordem vinha de `.order("created_at")`, mas a semeadura da admissão é um
// insert em lote: todas as linhas nascem com o mesmo created_at (NOW() da transação), então o
// Postgres devolvia o empate em ordem arbitrária.

export interface DocumentoOrdenavel {
  id: string;
  tipo_documento: string;
  storage_path: string | null;
  created_at: string;
}

// Padrão do upload: `${admissaoId}/${tipo}/${Date.now()}-nome` (token/[token]/documentos/[tipo]).
export function timestampDoStoragePath(storagePath: string | null | undefined): number | null {
  if (!storagePath) return null;
  const nome = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const m = /^(\d+)-/.exec(nome);
  return m ? Number(m[1]) : null;
}

function cmp<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Sort determinístico: tipo (ordem do array de referência; desconhecidos no fim, agrupados por
// nome) → timestamp do storage_path (sem timestamp vai depois dos que têm) → created_at → id.
export function ordenarDocumentosPacote<T extends DocumentoOrdenavel>(docs: readonly T[], ordemTipos: readonly string[]): T[] {
  const indiceTipo = (tipo: string) => {
    const i = ordemTipos.indexOf(tipo);
    return i === -1 ? ordemTipos.length : i;
  };
  return [...docs].sort((a, b) => {
    const porTipo = cmp(indiceTipo(a.tipo_documento), indiceTipo(b.tipo_documento));
    if (porTipo !== 0) return porTipo;
    const porNomeTipo = cmp(a.tipo_documento, b.tipo_documento);
    if (porNomeTipo !== 0) return porNomeTipo;
    const ta = timestampDoStoragePath(a.storage_path) ?? Number.POSITIVE_INFINITY;
    const tb = timestampDoStoragePath(b.storage_path) ?? Number.POSITIVE_INFINITY;
    const porTs = cmp(ta, tb);
    if (porTs !== 0) return porTs;
    // created_at vem do PostgREST em ISO com o mesmo offset em todas as linhas — comparar o
    // texto preserva a precisão de microssegundos que Date.parse perderia.
    const porCriacao = cmp(a.created_at.replace(" ", "T"), b.created_at.replace(" ", "T"));
    if (porCriacao !== 0) return porCriacao;
    return cmp(a.id, b.id);
  });
}

// Tipo com 2+ arquivos no pacote ganha " (1)", " (2)"… na ordem recebida; com 1 arquivo, sem número.
export function rotularDocumentos<T extends { tipo_documento: string }>(docs: readonly T[], labelPorTipo: (tipo: string) => string): string[] {
  const total = new Map<string, number>();
  for (const d of docs) total.set(d.tipo_documento, (total.get(d.tipo_documento) ?? 0) + 1);
  const visto = new Map<string, number>();
  return docs.map((d) => {
    const base = labelPorTipo(d.tipo_documento);
    if ((total.get(d.tipo_documento) ?? 0) < 2) return base;
    const n = (visto.get(d.tipo_documento) ?? 0) + 1;
    visto.set(d.tipo_documento, n);
    return `${base} (${n})`;
  });
}

export const ROTULO_RG_FRENTE_E_VERSO = "Identidade RG (frente e verso)";

export type MotivoNaoIncorporado = "download_falhou" | "formato_nao_suportado" | "pdf_sem_paginas" | `erro_ao_embutir:${string}`;

export interface EntradaIndice {
  rotulo: string;
  tipo_documento: string;
  // Página (1-based) já contando as páginas do índice; null quando não incorporado.
  paginaInicial: number | null;
  motivo?: MotivoNaoIncorporado;
}

export interface ResultadoAnexos {
  entradas: EntradaIndice[];
  // Página inicial de cada documento incorporado, para o índice e os bookmarks.
  paginasIniciais: Map<EntradaIndice, PDFPage>;
  // Quantidade de páginas do pacote antes do 1º documento — ponto de inserção do índice.
  paginasAntes: number;
  // Rótulos na mesma ordem dos documentos — alimenta a página "não incorporados".
  naoEmbutidos: string[];
  motivosNaoIncorporados: { tipo_documento: string; motivo: MotivoNaoIncorporado }[];
}

interface AnexarArgs {
  pdfDoc: PDFDocument;
  w: PdfWriter;
  admissaoId: string;
  // Já ordenados; só os com storage_path.
  docs: readonly DocumentoOrdenavel[];
  labelPorTipo: (tipo: string) => string;
  baixar: (storagePath: string) => Promise<Uint8Array | null>;
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// Se rg e rg_verso são o MESMO arquivo (RG digital com frente e verso, enviado nos dois campos),
// embute uma vez só. Só decide quando há exatamente uma linha de cada com arquivo e os dois
// downloads funcionaram; qualquer dúvida cai no comportamento normal (dois documentos).
// Os bytes baixados para comparar o hash ficam em `baixados`, pra o laço não baixar de novo.
async function detectarRgIdentico(docs: readonly DocumentoOrdenavel[], baixar: AnexarArgs["baixar"], baixados: Map<DocumentoOrdenavel, Uint8Array>) {
  const rgs = docs.filter((d) => d.tipo_documento === "rg");
  const versos = docs.filter((d) => d.tipo_documento === "rg_verso");
  if (rgs.length !== 1 || versos.length !== 1) return null;
  const [a, b] = await Promise.all([baixar(rgs[0].storage_path!), baixar(versos[0].storage_path!)]);
  if (a) baixados.set(rgs[0], a);
  if (b) baixados.set(versos[0], b);
  if (!a || !b || sha256(a) !== sha256(b)) return null;
  return { frente: rgs[0], verso: versos[0] };
}

export async function anexarDocumentosAoPacote({ pdfDoc, w, admissaoId, docs, labelPorTipo, baixar }: AnexarArgs): Promise<ResultadoAnexos> {
  const resultado: ResultadoAnexos = {
    entradas: [],
    paginasIniciais: new Map(),
    paginasAntes: pdfDoc.getPageCount(),
    naoEmbutidos: [],
    motivosNaoIncorporados: [],
  };

  const baixados = new Map<DocumentoOrdenavel, Uint8Array>();
  const rgIdentico = await detectarRgIdentico(docs, baixar, baixados);
  // O verso idêntico sai da lista ANTES de numerar/rotular, senão o contador de rótulos o enxergaria.
  const lista = rgIdentico ? docs.filter((d) => d !== rgIdentico.verso) : docs;
  const rotulos = rotularDocumentos(lista, labelPorTipo);

  for (let i = 0; i < lista.length; i++) {
    const doc = lista[i];
    const ehRgUnico = rgIdentico !== null && doc === rgIdentico.frente;
    const rotulo = ehRgUnico ? ROTULO_RG_FRENTE_E_VERSO : rotulos[i];
    const entrada: EntradaIndice = { rotulo, tipo_documento: doc.tipo_documento, paginaInicial: null };
    resultado.entradas.push(entrada);

    const falhar = (motivo: MotivoNaoIncorporado) => {
      entrada.motivo = motivo;
      resultado.naoEmbutidos.push(rotulo);
      resultado.motivosNaoIncorporados.push({ tipo_documento: doc.tipo_documento, motivo });
    };

    const bytes = baixados.get(doc) ?? (await baixar(doc.storage_path!));
    baixados.delete(doc); // libera a memória assim que o documento é consumido
    if (!bytes) {
      console.error(`[gerar-pdf] Documento não incorporado — admissao_id=${admissaoId} tipo_documento=${doc.tipo_documento} motivo=download_falhou`);
      falhar("download_falhou");
      continue;
    }
    const ext = doc.storage_path!.split(".").pop()?.toLowerCase() ?? "";

    try {
      if (ext === "jpg" || ext === "jpeg" || ext === "png") {
        const img = await embutirImagemComprimida(pdfDoc, bytes, ext);
        const docPage = pdfDoc.addPage(PageSizes.A4);
        docPage.drawText(safe(rotulo), { x: ML, y: PH - ML, size: 12, font: w.bold, color: DARK });
        const scale = Math.min((PW - ML * 2) / img.width, (PH - ML * 2 - 30) / img.height, 1);
        docPage.drawImage(img, { x: ML, y: ML, width: img.width * scale, height: img.height * scale });
        resultado.paginasIniciais.set(entrada, docPage);
      } else if (ext === "pdf") {
        const subDoc = await PDFDocument.load(bytes);
        const copiedPages = await pdfDoc.copyPages(subDoc, subDoc.getPageIndices());
        if (copiedPages.length === 0) {
          falhar("pdf_sem_paginas");
          continue;
        }
        copiedPages.forEach((p) => pdfDoc.addPage(p));
        resultado.paginasIniciais.set(entrada, copiedPages[0]);
      } else {
        // HEIC e outros formatos não suportados nativamente pelo pdf-lib
        falhar("formato_nao_suportado");
      }
    } catch (err) {
      // Sem CPF, sem nome de arquivo, sem conteúdo: só o suficiente pra diagnosticar o tipo de falha
      // (ex.: PDF criptografado → EncryptedPDFError) sem vazar dado pessoal pro log.
      const nome = err instanceof Error ? err.name : "Error";
      const mensagem = err instanceof Error ? err.message : String(err);
      console.error(`[gerar-pdf] Falha ao incorporar documento — admissao_id=${admissaoId} tipo_documento=${doc.tipo_documento} erro=${nome}: ${mensagem}`);
      falhar(`erro_ao_embutir:${nome}`);
    }
  }
  return resultado;
}

// ── Índice ────────────────────────────────────────────────────────────────

const ALTURA_LINHA = 16;

// Desenha o índice a partir de uma página nova e devolve as páginas usadas. A paginação vem do
// próprio PdfWriter (ensureSpace), então a quantidade de páginas só depende do nº de linhas.
export function desenharIndice(w: PdfWriter, entradas: readonly EntradaIndice[]): PDFPage[] {
  w.newPage();
  const paginas: PDFPage[] = [w.page];
  const garantir = (altura: number) => {
    const antes = w.page;
    w.ensureSpace(altura);
    if (w.page !== antes) paginas.push(w.page);
  };
  const linha = (rotulo: string, direita: string, corDireita = DARK) => {
    garantir(ALTURA_LINHA);
    const larguraNumero = w.regular.widthOfTextAtSize(direita, 10);
    const maxEsquerda = CW - larguraNumero - 12;
    let texto = safe(rotulo);
    if (w.regular.widthOfTextAtSize(texto, 10) > maxEsquerda) {
      while (texto.length > 1 && w.regular.widthOfTextAtSize(`${texto}...`, 10) > maxEsquerda) texto = texto.slice(0, -1);
      texto = `${texto.trimEnd()}...`;
    }
    w.page.drawText(texto, { x: ML, y: w.y, size: 10, font: w.regular, color: DARK });
    w.page.drawText(direita, { x: ML + CW - larguraNumero, y: w.y, size: 10, font: w.regular, color: corDireita });
    w.page.drawLine({ start: { x: ML, y: w.y - 4 }, end: { x: ML + CW, y: w.y - 4 }, thickness: 0.3, color: LIGHT_GRAY });
    w.y -= ALTURA_LINHA;
  };

  w.sectionTitle("Documentos anexados");
  for (const e of entradas.filter((x) => x.paginaInicial !== null)) linha(e.rotulo, `p. ${e.paginaInicial}`);

  const naoIncorporados = entradas.filter((x) => x.paginaInicial === null);
  if (naoIncorporados.length > 0) {
    w.y -= 8;
    garantir(ALTURA_LINHA * 2);
    w.drawText("Não incorporados automaticamente", w.bold, 10, GRAY);
    for (const e of naoIncorporados) linha(e.rotulo, "não incorporado", GRAY);
  }
  return paginas;
}

// Quantas páginas o índice vai ocupar — roda o MESMO desenho num PDF descartável, em vez de
// duplicar as constantes de margem/rodapé do PdfWriter. Os números de página entram com 4
// dígitos fixos para a largura não mudar o resultado.
export async function contarPaginasIndice(entradas: readonly EntradaIndice[]): Promise<number> {
  const sonda = await PdfWriter.create(await PDFDocument.create(), false);
  const fake = entradas.map((e) => ({ ...e, paginaInicial: e.paginaInicial === null ? null : 9999 }));
  return desenharIndice(sonda, fake).length;
}

// ── Bookmarks (outline) ───────────────────────────────────────────────────

// pdf-lib não tem API de outline. Lista plana (sem aninhamento): Catalog /Outlines com
// /First /Last /Count e, em cada item, /Parent /Prev /Next e /Dest [página /XYZ null null null].
export function adicionarBookmarks(pdfDoc: PDFDocument, itens: readonly { titulo: string; pagina: PDFPage }[]) {
  if (itens.length === 0) return;
  const ctx = pdfDoc.context;
  const raizRef = ctx.nextRef();
  const refs = itens.map(() => ctx.nextRef());
  itens.forEach((item, i) => {
    const dict = ctx.obj({
      Title: PDFHexString.fromText(item.titulo),
      Parent: raizRef,
      Dest: [item.pagina.ref, PDFName.of("XYZ"), null, null, null],
      ...(i > 0 ? { Prev: refs[i - 1] } : {}),
      ...(i < itens.length - 1 ? { Next: refs[i + 1] } : {}),
    });
    ctx.assign(refs[i], dict);
  });
  ctx.assign(raizRef, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: itens.length }));
  pdfDoc.catalog.set(PDFName.of("Outlines"), raizRef);
}

// Insere o índice antes do 1º documento anexado e cria os bookmarks. Chamar DEPOIS de todas as
// páginas do pacote existirem (inclusive a de "não incorporados"). O índice é desenhado no fim e
// movido para `paginasAntes`; como os números de página dos documentos dependem do tamanho do
// índice, o tamanho vem de contarPaginasIndice() antes do desenho real.
export async function inserirIndiceEBookmarks(pdfDoc: PDFDocument, w: PdfWriter, r: ResultadoAnexos): Promise<void> {
  if (r.entradas.length === 0) return;

  const n = await contarPaginasIndice(r.entradas.map((e) => ({ ...e, paginaInicial: r.paginasIniciais.has(e) ? 0 : null })));
  const paginasDoc = pdfDoc.getPages();
  for (const e of r.entradas) {
    const p = r.paginasIniciais.get(e);
    if (p) e.paginaInicial = paginasDoc.indexOf(p) + 1 + n;
  }

  const paginasIndice = desenharIndice(w, r.entradas);
  if (paginasIndice.length !== n) {
    console.error(`[gerar-pdf] Índice ocupou ${paginasIndice.length} página(s), esperado ${n} — números de página do índice podem estar deslocados`);
  }
  paginasIndice.forEach((pagina, k) => {
    pdfDoc.removePage(pdfDoc.getPages().indexOf(pagina));
    pdfDoc.insertPage(r.paginasAntes + k, pagina);
  });

  const final = pdfDoc.getPages();
  for (const e of r.entradas) {
    const p = r.paginasIniciais.get(e);
    if (p && final.indexOf(p) + 1 !== e.paginaInicial) {
      console.error(`[gerar-pdf] Página do índice não confere com a página real — tipo_documento=${e.tipo_documento}`);
    }
  }

  adicionarBookmarks(
    pdfDoc,
    r.entradas.flatMap((e) => {
      const p = r.paginasIniciais.get(e);
      return p ? [{ titulo: e.rotulo, pagina: p }] : [];
    })
  );
}
