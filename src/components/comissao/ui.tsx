"use client";

import type { ReactNode } from "react";
import { ROTULO_STATUS, type StatusLancamento, type TotaisComissao } from "@/lib/comissaoRegras";

export const moeda = (v: number | null | undefined): string =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataHora = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

const COR_STATUS: Record<StatusLancamento, { bg: string; color: string }> = {
  prevista: { bg: "#DBEAFE", color: "#1D4ED8" },
  confirmada: { bg: "#DCFCE7", color: "#166534" },
  retroativo_pendente: { bg: "#FEF3C7", color: "#92400E" },
  contestada: { bg: "#FEE2E2", color: "#991B1B" },
  cancelada: { bg: "#F3F4F6", color: "#6B7280" },
  recusada: { bg: "#F3F4F6", color: "#6B7280" },
};

export function StatusChip({ status }: { status: StatusLancamento }) {
  const c = COR_STATUS[status] ?? COR_STATUS.cancelada;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: c.bg, color: c.color }}>
      {ROTULO_STATUS[status] ?? status}
    </span>
  );
}

export function CardTotal({ titulo, valor, destaque }: { titulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="rounded-xl border p-4 bg-white" style={destaque ? { borderColor: "#FFB800", background: "#FFFBEB" } : { borderColor: "#E5E7EB" }}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{moeda(valor)}</p>
    </div>
  );
}

export function GradeTotais({ totais }: { totais: TotaisComissao }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <CardTotal titulo="Previsto" valor={totais.previsto} />
      <CardTotal titulo="Confirmado" valor={totais.confirmado} destaque />
      <CardTotal titulo="Contestado" valor={totais.contestado} />
      <CardTotal titulo="Retroativo pendente" valor={totais.retroativoPendente} />
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "ok" | "info"; children: ReactNode }) {
  const cor = tipo === "erro" ? "text-red-700 bg-red-50 border-red-200" : tipo === "ok" ? "text-green-800 bg-green-50 border-green-200" : "text-amber-900 bg-amber-50 border-amber-200";
  return <div role="status" className={`text-sm border rounded-lg px-3 py-2 ${cor}`}>{children}</div>;
}

export function mesInicial(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

export async function chamar<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: T & { error?: string } }> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, status: res.status, json };
}

export const tipoRotulo = (tipo: string): string => (tipo === "estorno" ? "Estorno" : tipo === "ajuste" ? "Ajuste" : "Comissão");
