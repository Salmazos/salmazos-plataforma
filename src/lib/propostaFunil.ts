// Efeito de UMA proposta sobre a oportunidade do Funil quando a oportunidade tem várias propostas (R&S, MOT, ...).
// Função PURA (sem imports de servidor): decide só o que fazer com etapa e valor; a camada de banco (propostaServico) aplica o resultado.
//
// REGRA DO NEGÓCIO (decidida com o Ölver):
//  - Ganha com QUALQUER proposta aceita; a oportunidade já ganha (ou perdida) nunca reabre nem muda de etapa.
//  - Só vira "perdido" quando NENHUMA proposta da oportunidade está ativa (enviada / em negociação) ou aceita e há ao menos uma recusada.
//    Rascunho, vencida e cancelada não contam como ativas e, sozinhas, não fecham a oportunidade.
//  - Valor da oportunidade aberta = SOMA do valor das propostas ATIVAS (cada proposta conta uma vez; valor nulo = 0).
//    Ao ganhar (e a cada nova aceita) = SOMA das ACEITAS.
import { etapaAposSituacao, type EtapaFunilDaProposta, type SituacaoProposta } from "@/lib/propostas";

export interface PropostaDoFunil {
  id: string;
  situacao: SituacaoProposta;
  valor_estimado: number | string | null | undefined;
}

export interface EntradaDecisaoFunil {
  // A proposta que acabou de mudar e a situação para a qual foi.
  evento: { propostaId: string; para: SituacaoProposta };
  etapaAtual: string;
  // TODAS as propostas da oportunidade, com a do evento JÁ na situação nova (e, no envio, já com o valor informado).
  propostas: PropostaDoFunil[];
}

export interface DecisaoFunil {
  // Etapa para onde a oportunidade vai; null = não muda de etapa.
  etapa: EtapaFunilDaProposta | null;
  // Valor a gravar na oportunidade (em reais); undefined = não mexe no valor.
  valorEstimado: number | undefined;
}

const ATIVAS: SituacaoProposta[] = ["enviada", "em_negociacao"];

// Soma em centavos inteiros (nada de ponto flutuante acumulando); valor ausente, inválido ou negativo conta como 0.
function somaEmReais(propostas: PropostaDoFunil[]): number {
  const centavos = propostas.reduce((s, p) => {
    const n = Number(p.valor_estimado ?? 0);
    return s + (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
  }, 0);
  return centavos / 100;
}

const SEM_EFEITO: DecisaoFunil = { etapa: null, valorEstimado: undefined };
// Zero nunca é gravado: o Funil exige valor > 0 em fase de proposta/ganho, e 0 aqui só significa "nenhuma proposta com valor".
const valorOuNada = (v: number): number | undefined => (v > 0 ? v : undefined);

export function decidirEfeitoFunil(e: EntradaDecisaoFunil): DecisaoFunil {
  const { para } = e.evento;
  const etapaFechada = e.etapaAtual === "ganho" || e.etapaAtual === "perdido";
  const ativas = e.propostas.filter((p) => ATIVAS.includes(p.situacao));
  const aceitas = e.propostas.filter((p) => p.situacao === "aceita");
  const recusadas = e.propostas.filter((p) => p.situacao === "recusada");

  switch (para) {
    case "enviada":
    case "em_negociacao":
      // Oportunidade fechada não é tocada (a camada de banco abre outra ao enviar, sem reabrir).
      if (etapaFechada) return SEM_EFEITO;
      return { etapa: etapaAposSituacao(para, e.etapaAtual), valorEstimado: valorOuNada(somaEmReais(ativas)) };
    case "aceita":
      // Perdida não reabre. Ganha continua ganha: só o valor passa a ser a soma das aceitas.
      if (e.etapaAtual === "perdido") return SEM_EFEITO;
      return { etapa: e.etapaAtual === "ganho" ? null : "ganho", valorEstimado: valorOuNada(somaEmReais(aceitas)) };
    case "recusada":
      // Recusa que chega depois de a oportunidade fechar não muda nada.
      if (etapaFechada) return SEM_EFEITO;
      // Fecha como perdida só se não sobrou ninguém ativo nem aceito (e a recusa do evento é, no mínimo, uma recusada).
      if (ativas.length === 0 && aceitas.length === 0 && recusadas.length > 0) return { etapa: "perdido", valorEstimado: undefined };
      return { etapa: null, valorEstimado: valorOuNada(somaEmReais(ativas)) };
    default:
      // Rascunho, vencida e cancelada não mexem no Funil (vencimento continua assim, como hoje).
      return SEM_EFEITO;
  }
}
