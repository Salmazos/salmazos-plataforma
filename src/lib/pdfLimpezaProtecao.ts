import { PDFDocument as PDFDocumentCantoo } from "@cantoo/pdf-lib";

// Limpeza de PDF PROTEGIDO (criptografado) para o pacote da admissão. O pdf-lib que o sistema usa NÃO descriptografa ("Input document ... is encrypted"); o fork
// @cantoo/pdf-lib descriptografa. Aqui ele é usado SÓ nesta etapa e NUNCA no copyPages do pacote: abre com senha VAZIA, copia as páginas para um documento NOVO do próprio
// @cantoo, salva e devolve os bytes limpos (um PDF comum), que o pdf-lib de sempre abre e copia. (Salvar o próprio documento aberto deixaria um /Encrypt solto no
// PDF com fluxos de objetos; o documento novo sai sem nenhum resto de proteção.)
//
// Regras: só senha vazia (PDF com restrições de impressão/edição, a "senha de proprietário", que abre sem senha); NUNCA outra senha; arquivo grande demais não é
// processado (tempo e memória da função); o número de páginas do resultado tem de ser igual ao do original; qualquer falha devolve ok:false e o documento cai na página
// "protegido por senha". Nunca lança e nunca loga conteúdo.

export const SENHA_VAZIA = "";

// Medido (PDFs sintéticos, AES-256, o caso mais lento): 5 MB = 0,8 s e ~50 MB a mais de memória; 28 MB = 4,0 s e ~250 MB a mais. A memória e o tempo crescem com o tamanho,
// e a rota de gerar o pacote ainda baixa e processa os outros documentos na mesma execução. 20 MB cobre com folga uma CTPS digital (alguns MB) e limita o pior caso a
// ~3 s e ~200 MB; acima disso vai direto para a página substituta (o analista baixa o original).
export const LIMITE_LIMPEZA_BYTES = 20 * 1024 * 1024;

export type MotivoLimpezaFalhou = "grande_demais" | "senha_de_abertura" | "sem_paginas" | "paginas_diferentes" | "erro";
export type ResultadoLimpeza = { ok: true; bytes: Uint8Array; paginas: number } | { ok: false; motivo: MotivoLimpezaFalhou };

export async function limparProtecaoPdf(bytes: Uint8Array, opcoes: { limiteBytes?: number } = {}): Promise<ResultadoLimpeza> {
  const limite = opcoes.limiteBytes ?? LIMITE_LIMPEZA_BYTES;
  if (bytes.byteLength > limite) return { ok: false, motivo: "grande_demais" };
  try {
    // ÚNICA tentativa de abertura, com a senha vazia. Se o PDF tem senha de abertura de verdade, o @cantoo recusa ("NEEDS PASSWORD") e o documento fica de fora.
    let original: PDFDocumentCantoo;
    try {
      original = await PDFDocumentCantoo.load(bytes, { password: SENHA_VAZIA });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "";
      return { ok: false, motivo: /needs password|password incorrect/i.test(mensagem) ? "senha_de_abertura" : "erro" };
    }
    const paginasOriginal = original.getPageCount();
    if (paginasOriginal === 0) return { ok: false, motivo: "sem_paginas" };

    const limpo = await PDFDocumentCantoo.create();
    const copiadas = await limpo.copyPages(original, original.getPageIndices());
    if (copiadas.length !== paginasOriginal) return { ok: false, motivo: "paginas_diferentes" };
    copiadas.forEach((p) => limpo.addPage(p));
    if (limpo.getPageCount() !== paginasOriginal) return { ok: false, motivo: "paginas_diferentes" };

    return { ok: true, bytes: await limpo.save(), paginas: paginasOriginal };
  } catch {
    return { ok: false, motivo: "erro" };
  }
}
