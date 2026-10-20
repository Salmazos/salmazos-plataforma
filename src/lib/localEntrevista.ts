// Local da entrevista (texto livre digitado pelo cliente no portal ou pela equipe da Salmazos).
// Texto de usuário: sempre normalizado no servidor antes de gravar e sempre exibido como TEXTO (React escapa;
// em e-mail, escaparHtml no corpo; nunca no assunto).

export const LOCAL_ENTREVISTA_MAX = 200;

// Controle C0/C1 (inclui \n, \r, \t), separadores de linha/parágrafo, marcas invisíveis e de direção de texto
// (zero-width, bidi) — nada disso tem lugar num endereço digitado.
const INVISIVEIS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]+/g;

// trim, quebras de linha/controles viram espaço, espaços repetidos colapsam, limite de 200 caracteres. Vazio → null.
// HTML não é removido: o texto é guardado como digitado e escapado só na hora de exibir.
export function normalizarLocalEntrevista(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const limpo = texto.replace(INVISIVEIS, " ").replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  const caracteres = Array.from(limpo); // por ponto de código: não corta um emoji ao meio
  return caracteres.length > LOCAL_ENTREVISTA_MAX ? caracteres.slice(0, LOCAL_ENTREVISTA_MAX).join("").trimEnd() : limpo;
}

// (O local dentro de mensagem curta — sino — é truncado por anexarLocalAMensagem, em avisoClienteRegras.ts.)

// Regra do PATCH /api/encaminhamentos/[id] quando o pedido traz data e/ou local da entrevista. Pura, para ser
// verificada sem banco (scripts/verificar-local-entrevista.mts). `pedido.data_entrevista` já vem normalizada
// (normalizarDataEntrevista) e `pedido.local_entrevista` já vem pelo normalizarLocalEntrevista; undefined = o
// campo não veio no pedido (null no local = limpar).
//   - data diferente da gravada            → remarcação: grava data, zera o lembrete "entrevista hoje", histórico de
//                                            remarcação (leva o local) e aviso ao cliente (sino do portal).
//   - data igual (ex.: o modal reenviando a data só pra corrigir o local) → NÃO é remarcação: não regrava a data,
//                                            não zera o lembrete, sem aviso ao cliente.
//   - só o local mudou                     → grava o local e registra "Local da entrevista alterado" no histórico;
//                                            sem aviso ao cliente e sem tocar no lembrete.
export interface DecisaoEntrevista {
  dataMudou: boolean;
  localMudou: boolean;
  campos: Record<string, unknown>;
  historico: "remarcacao" | "local" | null;
  avisarCliente: boolean;
  localFinal: string | null;
}

export function decidirAlteracaoEntrevista(
  anterior: { data_entrevista?: string | null; local_entrevista?: string | null } | null | undefined,
  pedido: { data_entrevista?: string | null; local_entrevista?: string | null }
): DecisaoEntrevista {
  const dataAnterior = anterior?.data_entrevista ?? null;
  const localAnterior = anterior?.local_entrevista ?? null;
  const campos: Record<string, unknown> = {};

  const dataEnviada = pedido.data_entrevista !== undefined && pedido.data_entrevista !== null;
  const tempoAnterior = dataAnterior ? new Date(dataAnterior).getTime() : null;
  const dataMudou = dataEnviada && tempoAnterior !== new Date(pedido.data_entrevista as string).getTime();
  if (dataMudou) {
    campos.data_entrevista = pedido.data_entrevista;
    campos.lembrete_entrevista_hoje_enviado_em = null;
  }

  const localMudou = pedido.local_entrevista !== undefined && pedido.local_entrevista !== localAnterior;
  if (localMudou) campos.local_entrevista = pedido.local_entrevista;

  return {
    dataMudou,
    localMudou,
    campos,
    historico: dataMudou ? "remarcacao" : localMudou ? "local" : null,
    avisarCliente: dataMudou,
    localFinal: localMudou ? (pedido.local_entrevista ?? null) : localAnterior,
  };
}
