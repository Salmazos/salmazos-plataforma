import type { createServiceClient } from "@/lib/supabase/server";
import { marcadorCobrancaNaObservacao } from "@/lib/cobrancaRSFaturamento";

type Service = ReturnType<typeof createServiceClient>;

// Depois de aprovada a cobrança congela (PATCH /api/cobrancas-rs/[id] só edita em pendente_revisao). A correção de taxa
// é uma rota à parte e só vale enquanto a cobrança ainda está em aberto: pendente_revisao já edita normalmente na revisão,
// paga e cancelada são histórico financeiro.
export const STATUS_TAXA_CORRIGIVEL = ["aprovada_enviada", "validada"] as const;

// Mesma conta de /api/cobrancas-rs/[id]/aprovar (centavos arredondados).
export function calcularFeeValor(salario: number, percentual: number): number {
  return Math.round(((salario * percentual) / 100) * 100) / 100;
}

export type ValidacaoCorrecaoTaxa = { ok: true; feeValor: number } | { ok: false; error: string };

export function validarCorrecaoDeTaxa(c: { status: string; salario: number | null }, percentual: number): ValidacaoCorrecaoTaxa {
  if (c.status === "pendente_revisao") {
    return { ok: false, error: "Esta cobrança ainda está em revisão — ajuste a taxa direto na revisão, antes de aprovar." };
  }
  if (c.status === "paga") return { ok: false, error: "Esta cobrança já foi paga — a taxa não pode mais ser corrigida." };
  if (c.status === "cancelada") return { ok: false, error: "Esta cobrança foi cancelada — a taxa não pode ser corrigida." };
  if (!(STATUS_TAXA_CORRIGIVEL as readonly string[]).includes(c.status)) {
    return { ok: false, error: "A taxa só pode ser corrigida em cobranças enviadas ou validadas." };
  }
  if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 100) {
    return { ok: false, error: "Informe uma taxa maior que 0 e até 100." };
  }
  const salario = Number(c.salario);
  if (!Number.isFinite(salario) || salario <= 0) {
    return { ok: false, error: "Esta cobrança não tem salário válido — não é possível recalcular o valor." };
  }
  return { ok: true, feeValor: calcularFeeValor(salario, percentual) };
}

export interface LancamentoDaCobranca {
  id: string;
  status: string;
  valor: number;
  data_vencimento: string;
}

// O lançamento em Faturamento Unidades só se liga à cobrança pelo marcador no texto das observações (sem coluna de vínculo).
export async function buscarLancamentosDaCobranca(
  svc: Service,
  cobrancaId: string
): Promise<{ lancamentos: LancamentoDaCobranca[]; erro: string | null }> {
  const { data, error } = await svc
    .from("contas_receber_hortolandia")
    .select("id, status, valor, data_vencimento")
    .ilike("observacoes", `%${marcadorCobrancaNaObservacao(cobrancaId)}%`);
  if (error) return { lancamentos: [], erro: error.message };
  return { lancamentos: (data ?? []) as LancamentoDaCobranca[], erro: null };
}

function brl(v: number): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Só lançamento ainda 'pendente' é tocado. 'pago' já foi conciliado e vira aviso; 'cancelado' é ignorado.
export function separarLancamentos(lancamentos: LancamentoDaCobranca[]) {
  return {
    pendentes: lancamentos.filter((l) => l.status === "pendente"),
    pagos: lancamentos.filter((l) => l.status === "pago"),
  };
}

const emCentavos = (v: number | null | undefined) => Math.round(Number(v) * 100);

// Só o lançamento que ainda carrega o valor ANTIGO da cobrança acompanha a correção (comparação em centavos). Valor diferente
// significa que alguém ajustou o lançamento na mão (desconto, retenção...) e a correção não pode sobrescrever isso.
export function separarPorValorAntigo(pendentes: LancamentoDaCobranca[], feeValorAntigo: number | null) {
  const antigo = emCentavos(feeValorAntigo);
  const alinhados = pendentes.filter((l) => feeValorAntigo != null && emCentavos(l.valor) === antigo);
  return { alinhados, divergentes: pendentes.filter((l) => !alinhados.includes(l)) };
}

export const AVISO_LANCAMENTO_AJUSTADO =
  "O lançamento em Faturamento Unidades tem valor ajustado manualmente e não foi alterado. Confira se precisa corrigir.";

export function avisoLancamentoPago(pagos: LancamentoDaCobranca[], o: { campo: "valor" | "vencimento" }): string | null {
  if (pagos.length === 0) return null;
  const plural = pagos.length > 1;
  const oque = o.campo === "valor" ? "o valor" : "o vencimento";
  return `${plural ? "Há lançamentos" : "O lançamento"} em Faturamento Unidades já ${plural ? "estão pagos" : "está pago"} e não ${plural ? "foram alterados" : "foi alterado"}: ${oque} ${plural ? "deles" : "dele"} continua ${
    o.campo === "valor" ? pagos.map((p) => brl(p.valor)).join(", ") : pagos.map((p) => p.data_vencimento.split("-").reverse().join("/")).join(", ")
  }. Ajuste manualmente se necessário.`;
}
