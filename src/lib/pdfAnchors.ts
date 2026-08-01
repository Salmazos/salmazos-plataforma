import { getDocumentProxy, extractTextItems } from "unpdf";

// Detecta, num PDF já mergeado, em que página e posição relativa aparece o texto que
// identifica a linha de assinatura de cada parte (ex: nome do candidato, "CONTRATADO",
// "CEDENTE OU CONTRATADA") — usado para posicionar a assinatura da ZapSign exatamente
// sobre a linha impressa, em vez de coordenada fixa hardcoded por documento.
//
// Usa `unpdf` (não pdfjs-dist direto) DE PROPÓSITO: pdfjs-dist precisa de um worker_thread
// real em Node pra extração de texto funcionar (sem isso, o modo "fake worker" quebra com
// "DOMException [DataCloneError]: Cannot transfer object of unsupported type" — confirmado
// em teste real nesta sessão). Resolver o caminho do worker exige import.meta.resolve, que
// o bundler do Next.js (webpack) não suporta em rotas de API server-side — build falha com
// "Critical dependency: Accessing import.meta directly is unsupported" e depois
// "{}.resolve is not a function" em runtime (também confirmado em teste real). unpdf
// empacota uma build de pdfjs.js compilada especificamente pra ambientes serverless, sem
// exigir worker — evita os dois problemas.

export type PapelSignatario = "contratante" | "contratado";

export interface DefinicaoAncora {
  papel: PapelSignatario;
  // Primeiro padrão que bater na página vence — nenhuma ordem de prioridade além da
  // ordem do array. Comparação de string é case-insensitive (RegExp usa as flags que
  // vierem definidas no padrão).
  padroes: (string | RegExp)[];
}

export interface AncoraDetectada {
  pagina: number; // 0-indexed — mesmo referencial usado pelo place-signatures da ZapSign
  papel: PapelSignatario;
  relative_position_left: number; // 0-100, canto esquerdo do início do texto encontrado
  relative_position_bottom: number; // 0-100, base do texto encontrado (origem do PDF é inferior-esquerda)
}

export interface ResultadoDeteccao {
  ancoras: AncoraDetectada[];
  totalPaginas: number;
}

// Posição de rubrica pra páginas sem nenhuma âncora textual detectada (páginas do meio
// de documentos multi-página, sem linha de assinatura impressa) — canto superior
// direito, com margem suficiente pra não sobrepor o texto do contrato. Único lugar pra
// ajustar caso um teste visual futuro mostre que precisa de mais/menos margem — não
// duplicar esse valor em nenhuma rota/chamador.
//
// CORRIGIDO após teste visual real (rasterização do PDF assinado, sandbox): o valor
// original (left:85) somado à largura da caixa (relative_size_x:22, ver TAMANHO_CAIXA em
// lib/zapsign.ts) somava 107% — ultrapassava a borda direita da página e a rubrica saía
// cortada. left:73 mantém a caixa inteira dentro da página (73+22=95%, 5% de margem).
// contratante/contratado ficam em alturas diferentes (bottom 90 vs 78) de propósito —
// as duas rubricas caem na mesma página quando não há âncora, e com a mesma posição elas
// ficavam exatamente uma em cima da outra (só uma aparecia visualmente).
export const RUBRICA_POSICAO_PADRAO = {
  contratante: { relative_position_left: 73, relative_position_bottom: 90 },
  contratado: { relative_position_left: 73, relative_position_bottom: 78 },
} as const;

export async function detectarAncoras(
  pdfBytes: Uint8Array,
  definicoes: DefinicaoAncora[]
): Promise<ResultadoDeteccao> {
  const doc = await getDocumentProxy(pdfBytes);
  const { items } = await extractTextItems(doc); // items[pagina] = StructuredTextItem[], 0-indexed

  const encontradas: AncoraDetectada[] = [];

  for (let pagina = 0; pagina < items.length; pagina++) {
    // view = [x0, y0, x1, y1] (MediaBox) — largura/altura reais da página, precisa pra
    // converter x,y absolutos em percentual (0-100) exigido pela API da ZapSign.
    const page = await doc.getPage(pagina + 1); // getPage é 1-indexed
    const [x0, y0, x1, y1] = page.view;
    const largura = x1 - x0;
    const altura = y1 - y0;

    for (const def of definicoes) {
      // Só a primeira ocorrência por (página, papel) — uma página não deve ter 2
      // posições candidatas pro mesmo signatário.
      const jaAchouNessaPagina = encontradas.some((a) => a.pagina === pagina && a.papel === def.papel);
      if (jaAchouNessaPagina) continue;

      for (const item of items[pagina]) {
        if (!item.str) continue;
        const bateu = def.padroes.some((p) =>
          typeof p === "string" ? item.str.toLowerCase().includes(p.toLowerCase()) : p.test(item.str)
        );
        if (!bateu) continue;

        encontradas.push({
          pagina,
          papel: def.papel,
          relative_position_left: ((item.x - x0) / largura) * 100,
          relative_position_bottom: ((item.y - y0) / altura) * 100,
        });
        break;
      }
    }
  }

  return { ancoras: encontradas, totalPaginas: items.length };
}
