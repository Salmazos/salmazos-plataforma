// Condições comerciais que o cliente aceitou no link público (snapshot em solicitacoes_vagas.condicoes_aceitas) -> campos da vaga que o
// Financeiro R&S já usa. Módulo puro, sem imports: roda no script de verificação e nunca lança.
//
// MAPEAMENTO (decidido com o Olver):
//  - fee_rs_percentual           = taxa_sem_reposicao_pct (45 é 45%, número de percentual, não 0,45). A taxa com reposição (55) fica só no snapshot.
//  - fee_rs_prazo_cobranca       = "<prazo_faturamento_dias> dias" (dias corridos; "1 dia" no singular), texto livre como as vagas já existentes ("14 dias").
//  - taxa_cancelamento           = taxa_cancelamento_pct > 0; taxa_cancelamento_percentual = o próprio percentual (nulo quando não há taxa).
// Snapshot ausente, nulo ou fora do formato: tudo nulo/false. Nunca se completa com os padrões da proposta ("sem decidir no escuro").

export interface CondicoesDaVaga {
  fee_rs_percentual: number | null;
  fee_rs_prazo_cobranca: string | null;
  taxa_cancelamento: boolean;
  taxa_cancelamento_percentual: number | null;
}

export const CONDICOES_VAGA_VAZIAS: CondicoesDaVaga = Object.freeze({
  fee_rs_percentual: null,
  fee_rs_prazo_cobranca: null,
  taxa_cancelamento: false,
  taxa_cancelamento_percentual: null,
});

const ehNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Mesmas faixas do schema das condições da proposta (propostaModelos.ts): taxa de 0 (exclusive) a 100, cancelamento de 0 a 100, prazo
// inteiro de 1 a 365 dias. Os valores precisam ser NÚMEROS (o snapshot é gravado já validado); texto como "45" não é aceito.
export function condicoesParaVaga(condicoesAceitas: unknown): CondicoesDaVaga {
  try {
    if (condicoesAceitas === null || typeof condicoesAceitas !== "object" || Array.isArray(condicoesAceitas)) return { ...CONDICOES_VAGA_VAZIAS };
    const c = (condicoesAceitas as { condicoes?: unknown }).condicoes;
    if (c === null || typeof c !== "object" || Array.isArray(c)) return { ...CONDICOES_VAGA_VAZIAS };
    const { taxa_sem_reposicao_pct: taxa, prazo_faturamento_dias: prazo, taxa_cancelamento_pct: cancelamento } = c as Record<string, unknown>;

    if (!ehNumero(taxa) || taxa <= 0 || taxa > 100) return { ...CONDICOES_VAGA_VAZIAS };
    if (!ehNumero(prazo) || !Number.isInteger(prazo) || prazo < 1 || prazo > 365) return { ...CONDICOES_VAGA_VAZIAS };
    if (!ehNumero(cancelamento) || cancelamento < 0 || cancelamento > 100) return { ...CONDICOES_VAGA_VAZIAS };

    return {
      fee_rs_percentual: taxa,
      fee_rs_prazo_cobranca: `${prazo} ${prazo === 1 ? "dia" : "dias"}`,
      taxa_cancelamento: cancelamento > 0,
      taxa_cancelamento_percentual: cancelamento > 0 ? cancelamento : null,
    };
  } catch {
    return { ...CONDICOES_VAGA_VAZIAS };
  }
}
