"use client";

import { useMemo, useState } from "react";
import ModalContaReceberHortolandia from "./ModalContaReceberHortolandia";

export interface ContaReceberRow {
  id: string;
  clienteId: string;
  clienteNome: string;
  numeroNf: string | null;
  valorBruto: number | null;
  valorLiquido: number;
  dataVencimento: string;
  dataPagamento: string | null;
  dataEmissaoNf: string | null;
  status: "pendente" | "pago" | "cancelado";
  observacoes: string | null;
}

interface Props {
  rowsIniciais: ContaReceberRow[];
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  pendente: { label: "Pendente", bg: "#FEF3C7", color: "#92400E" },
  pago: { label: "Pago", bg: "#DCFCE7", color: "#166534" },
  cancelado: { label: "Cancelado", bg: "#F3F4F6", color: "#6B7280" },
  atrasado: { label: "Atrasado", bg: "#FEE2E2", color: "#991B1B" },
};

function formatarMoeda(v: number | null): string {
  return v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  // Datas vêm como "YYYY-MM-DD" (coluna DATE do Postgres, sem hora) — monta o Date local
  // direto pelos componentes pra não sofrer o típico bug de virar um dia pra trás por
  // fuso quando parseado como UTC meia-noite.
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR");
}

function diasParaVencimento(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const vencimento = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((vencimento.getTime() - hoje.getTime()) / 86_400_000);
}

function statusEfetivo(row: ContaReceberRow): string {
  if (row.status === "pendente" && diasParaVencimento(row.dataVencimento) < 0) return "atrasado";
  return row.status;
}

type FiltroTab = "pendente" | "pago" | "cancelado" | "todas";

export default function FaturamentoHortolandiaPageClient({ rowsIniciais }: Props) {
  const [rows, setRows] = useState(rowsIniciais);
  const [tab, setTab] = useState<FiltroTab>("pendente");
  const [contaAberta, setContaAberta] = useState<ContaReceberRow | null | "novo">(null);

  const rowsFiltradas = useMemo(() => {
    if (tab === "todas") return rows;
    return rows.filter((r) => r.status === tab);
  }, [rows, tab]);

  const totalLiquidoFiltrado = rowsFiltradas.reduce((soma, r) => soma + r.valorLiquido, 0);

  function handleSalva(row: ContaReceberRow) {
    setRows((prev) => {
      const existe = prev.some((r) => r.id === row.id);
      return existe ? prev.map((r) => (r.id === row.id ? row : r)) : [row, ...prev];
    });
    setContaAberta(null);
  }

  function handleExcluida(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setContaAberta(null);
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturamento Hortolândia</h1>
          <p className="text-sm text-gray-500 mt-1">Contas a receber — controle manual da unidade Hortolândia.</p>
        </div>
        <button onClick={() => setContaAberta("novo")} className="btn-primary">
          + Novo lançamento
        </button>
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {(["pendente", "pago", "cancelado", "todas"] as FiltroTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-[#FFB800] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "pendente" ? "Pendentes" : t === "pago" ? "Pagos" : t === "cancelado" ? "Cancelados" : "Todas"}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-2 px-3">Vencimento</th>
              <th className="py-2 px-3">Cliente</th>
              <th className="py-2 px-3">Nº NF</th>
              <th className="py-2 px-3 text-right">Bruto</th>
              <th className="py-2 px-3 text-right">Valor Líq.</th>
              <th className="py-2 px-3 text-center">Dias p/ venc.</th>
              <th className="py-2 px-3">Pagamento</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Emissão NF/Acordo</th>
            </tr>
          </thead>
          <tbody>
            {rowsFiltradas.map((row) => {
              const status = statusEfetivo(row);
              const s = STATUS_LABEL[status];
              const dias = diasParaVencimento(row.dataVencimento);
              return (
                <tr
                  key={row.id}
                  onClick={() => setContaAberta(row)}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="py-2 px-3">{formatarData(row.dataVencimento)}</td>
                  <td className="py-2 px-3 font-medium text-gray-900">{row.clienteNome}</td>
                  <td className="py-2 px-3 text-gray-500">{row.numeroNf ?? "—"}</td>
                  <td className="py-2 px-3 text-right">{formatarMoeda(row.valorBruto)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatarMoeda(row.valorLiquido)}</td>
                  <td className="py-2 px-3 text-center text-gray-500">
                    {row.status === "pendente" ? dias : "—"}
                  </td>
                  <td className="py-2 px-3">{formatarData(row.dataPagamento)}</td>
                  <td className="py-2 px-3">
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: s.bg, color: s.color }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="py-2 px-3">{formatarData(row.dataEmissaoNf)}</td>
                </tr>
              );
            })}
            {rowsFiltradas.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  Nenhum lançamento nessa visão.
                </td>
              </tr>
            )}
          </tbody>
          {rowsFiltradas.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold text-gray-900">
                <td className="py-2 px-3" colSpan={4}>
                  Total ({rowsFiltradas.length})
                </td>
                <td className="py-2 px-3 text-right">{formatarMoeda(totalLiquidoFiltrado)}</td>
                <td className="py-2 px-3" colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {contaAberta && (
        <ModalContaReceberHortolandia
          conta={contaAberta === "novo" ? null : contaAberta}
          onClose={() => setContaAberta(null)}
          onSalva={handleSalva}
          onExcluida={handleExcluida}
        />
      )}
    </div>
  );
}
