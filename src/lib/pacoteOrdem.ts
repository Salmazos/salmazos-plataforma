import { createHash } from "node:crypto";
import { PDFDocument, PDFHexString, PDFName, PDFPage, PageSizes } from "pdf-lib";
import { getDocumentProxy } from "unpdf";
import { PdfWriter, PW, PH, ML, CW, safe, DARK, GRAY, LIGHT_GRAY, embutirImagemComprimida } from "@/lib/pdfWriter";
import { MOTIVO_PDF_PROTEGIDO } from "@/lib/pacoteNaoIncorporados";

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
export const ROTULO_CERTIDAO_FRENTE_E_VERSO = "Certidão de Nascimento/Casamento/União Estável (frente e verso)";

export type MotivoNaoIncorporado = "download_falhou" | "formato_nao_suportado" | "pdf_sem_paginas" | "pdf_protegido" | `erro_ao_embutir:${string}`;

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
  // `rotulo` acompanha o motivo (mesma ordem de naoEmbutidos): a tela e a auditoria mostram QUAL documento ficou de fora e por quê.
  motivosNaoIncorporados: { tipo_documento: string; rotulo: string; motivo: MotivoNaoIncorporado }[];
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

// Pares frente/verso em que o MESMO arquivo enviado nos dois campos (documento digital com as duas faces, ou PDF único
// anexado em ambos) vira um documento só no pacote. Só decide quando há exatamente uma linha de cada com arquivo e os dois
// downloads funcionaram; qualquer dúvida cai no comportamento normal (dois documentos).
const PARES_FRENTE_VERSO = [
  { frente: "rg", verso: "rg_verso", rotulo: ROTULO_RG_FRENTE_E_VERSO },
  { frente: "certidao_civil", verso: "certidao_civil_verso", rotulo: ROTULO_CERTIDAO_FRENTE_E_VERSO },
] as const;

// Os bytes baixados para comparar o hash ficam em `baixados`, pra o laço não baixar de novo.
async function detectarParesIdenticos(docs: readonly DocumentoOrdenavel[], baixar: AnexarArgs["baixar"], baixados: Map<DocumentoOrdenavel, Uint8Array>) {
  const achados: { frente: DocumentoOrdenavel; verso: DocumentoOrdenavel; rotulo: string }[] = [];
  for (const par of PARES_FRENTE_VERSO) {
    const frentes = docs.filter((d) => d.tipo_documento === par.frente);
    const versos = docs.filter((d) => d.tipo_documento === par.verso);
    if (frentes.length !== 1 || versos.length !== 1) continue;
    const [a, b] = await Promise.all([baixar(frentes[0].storage_path!), baixar(versos[0].storage_path!)]);
    if (a) baixados.set(frentes[0], a);
    if (b) baixados.set(versos[0], b);
    if (!a || !b || sha256(a) !== sha256(b)) continue;
    achados.push({ frente: frentes[0], verso: versos[0], rotulo: par.rotulo });
  }
  return achados;
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
  const pares = await detectarParesIdenticos(docs, baixar, baixados);
  const versosIdenticos = new Set(pares.map((p) => p.verso));
  // O verso idêntico sai da lista ANTES de numerar/rotular, senão o contador de rótulos o enxergaria.
  const lista = docs.filter((d) => !versosIdenticos.has(d));
  const rotulos = rotularDocumentos(lista, labelPorTipo);

  for (let i = 0; i < lista.length; i++) {
    const doc = lista[i];
    const parUnico = pares.find((p) => p.frente === doc);
    const rotulo = parUnico ? parUnico.rotulo : rotulos[i];
    const entrada: EntradaIndice = { rotulo, tipo_documento: doc.tipo_documento, paginaInicial: null };
    resultado.entradas.push(entrada);

    const falhar = (motivo: MotivoNaoIncorporado) => {
      entrada.motivo = motivo;
      resultado.naoEmbutidos.push(rotulo);
      resultado.motivosNaoIncorporados.push({ tipo_documento: doc.tipo_documento, rotulo, motivo });
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
      // PDF protegido (criptografado): motivo próprio. O nome do erro do pdf-lib vem como "Error", então "erro_ao_embutir:Error" não dizia a causa.
      if (ext === "pdf" && ehPdfProtegido(err, bytes)) {
        await diagnosticarCriptografia(bytes, admissaoId, doc.tipo_documento);
        falhar(MOTIVO_PDF_PROTEGIDO);
        continue;
      }
      falhar(`erro_ao_embutir:${nome}`);
    }
  }
  return resultado;
}

// ── PDF protegido (criptografado) ────────────────────────────────────────────
// O pdf-lib não descriptografa: PDFDocument.load lança "Input document to `PDFDocument.load` is encrypted". Detecta pelo texto do erro OU por /Encrypt nos bytes (o
// texto da mensagem pode mudar entre versões; a chamada só acontece depois de a abertura já ter falhado).
export function ehPdfProtegido(err: unknown, bytes: Uint8Array): boolean {
  const mensagem = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (mensagem.includes("encrypted")) return true;
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes("/Encrypt");
}

export interface ParametrosEncrypt {
  versao: number | null; // /V
  revisao: number | null; // /R
  tamanhoChaveBits: number | null; // /Length (ausente = 40 por padrão em V1)
  filtro: string | null; // /Filter
  metodo: string | null; // /CFM (V2 = RC4, AESV2 = AES-128, AESV3 = AES-256)
  permissoes: Record<string, boolean> | null; // flags de /P
}

// Lê SÓ os números do dicionário /Encrypt (nada do conteúdo, nome ou texto do documento). Retorna null se não achar o dicionário.
export function lerParametrosEncrypt(bytes: Uint8Array): ParametrosEncrypt | null {
  if (bytes.byteLength > 60 * 1024 * 1024) return null;
  const texto = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  const ref = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(texto);
  let dicionario: string | null = null;
  if (ref) {
    const inicio = new RegExp(`(?:^|[\\s>])${ref[1]}\\s+${ref[2]}\\s+obj`).exec(texto);
    if (inicio) dicionario = texto.slice(inicio.index, texto.indexOf("endobj", inicio.index) + 6);
  } else {
    const direto = /\/Encrypt\s*<</.exec(texto);
    if (direto) dicionario = texto.slice(direto.index, direto.index + 2000);
  }
  if (!dicionario) return null;
  const numero = (chave: string) => { const m = new RegExp(`/${chave}\\s+(-?\\d+)`).exec(dicionario!); return m ? Number(m[1]) : null; };
  const nome = (chave: string) => { const m = new RegExp(`/${chave}\\s*/(\\w+)`).exec(dicionario!); return m ? m[1] : null; };
  const p = numero("P");
  const bit = (n: number) => p !== null && (((p >>> 0) >> (n - 1)) & 1) === 1;
  return {
    versao: numero("V"), revisao: numero("R"), tamanhoChaveBits: numero("Length"), filtro: nome("Filter"), metodo: nome("CFM"),
    permissoes: p === null ? null : { imprimir: bit(3), modificar: bit(4), copiar: bit(5), anotar: bit(6), preencherFormulario: bit(9), acessibilidade: bit(10), montar: bit(11), imprimirAltaQualidade: bit(12) },
  };
}

// Diagnóstico para decidir a correção (senha de proprietário x senha de abertura): registra só a versão/revisão/tamanho da chave/flags de permissão do /Encrypt e se o
// unpdf (pdf.js) abre o arquivo com SENHA VAZIA. Nenhum conteúdo, nome ou texto do documento vai para o log. Nunca lança.
export async function diagnosticarCriptografia(bytes: Uint8Array, admissaoId: string, tipoDocumento: string): Promise<void> {
  try {
    const p = lerParametrosEncrypt(bytes);
    let abreComSenhaVazia: string;
    try {
      const doc = await getDocumentProxy(bytes.slice()); // cópia: o pdf.js pode "consumir" o buffer
      abreComSenhaVazia = "sim";
      void doc;
    } catch (e) {
      abreComSenhaVazia = `nao(${e instanceof Error ? e.name : "erro"})`;
    }
    console.error(
      `[gerar-pdf] Diagnóstico /Encrypt — admissao_id=${admissaoId} tipo_documento=${tipoDocumento} v=${p?.versao ?? "?"} r=${p?.revisao ?? "?"} length=${p?.tamanhoChaveBits ?? "?"} filtro=${p?.filtro ?? "?"} metodo=${p?.metodo ?? "?"} permissoes=${p?.permissoes ? JSON.stringify(p.permissoes) : "?"} abre_com_senha_vazia=${abreComSenhaVazia}`,
    );
  } catch {
    console.error(`[gerar-pdf] Diagnóstico /Encrypt indisponível — admissao_id=${admissaoId} tipo_documento=${tipoDocumento}`);
  }
}

// ── Página "Documentos não incorporados" ─────────────────────────────────────
export const TEXTO_PDF_PROTEGIDO = "Documento protegido por senha. Não foi possível incorporá-lo ao pacote. Baixe o original no painel.";
export const TEXTO_FORMATO_NAO_SUPORTADO = "(formato não suportado — baixe o arquivo original no painel)";

// Uma página com os documentos que ficaram de fora, agrupados pelo motivo: protegido por senha tem o texto próprio; os demais mantêm o texto de sempre.
export function desenharPaginaNaoIncorporados(w: PdfWriter, anexos: Pick<ResultadoAnexos, "motivosNaoIncorporados">): boolean {
  const lista = anexos.motivosNaoIncorporados;
  if (lista.length === 0) return false;
  w.newPage();
  w.drawText("Documentos não incorporados automaticamente", w.bold, 12, DARK);
  const grupo = (texto: string, itens: typeof lista) => {
    if (itens.length === 0) return;
    w.y -= 6;
    // o texto não quebra linha sozinho: se passar da largura útil, vai uma frase por linha
    const partes = w.regular.widthOfTextAtSize(safe(texto), 9) > CW ? texto.split(/(?<=\.) /) : [texto];
    for (const parte of partes) w.drawText(parte, w.regular, 9, GRAY);
    w.y -= 6;
    for (const it of itens) w.drawText(`• ${it.rotulo}`, w.regular, 10, DARK);
  };
  grupo(TEXTO_PDF_PROTEGIDO, lista.filter((m) => m.motivo === MOTIVO_PDF_PROTEGIDO));
  grupo(TEXTO_FORMATO_NAO_SUPORTADO, lista.filter((m) => m.motivo !== MOTIVO_PDF_PROTEGIDO));
  return true;
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
