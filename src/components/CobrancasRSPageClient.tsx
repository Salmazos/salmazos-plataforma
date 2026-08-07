"use client";

import { useMemo, useState } from "react";
import ModalRevisaoCobrancaRS from "./ModalRevisaoCobrancaRS";

export interface CobrancaRSRow {
  id: string;
  clienteNomeSnapshot: string;
  clienteCnpjSnapshot: string | null;
  clienteEnderecoSnapshot: string | null;
  clienteTelefoneSnapshot: string | null;
  clienteEmailSnapshot: string | null;
  candidatoNomeSnapshot: string;
  vagaTitulo: string;
  cargo: string | null;
  salario: number | null;
  dataInicio: string | null;
  feePercentual: number | null;
  feeValor: number | null;
  status: "pendente_revisao" | "aprovada_enviada" | "paga" | "cancelada";
  createdAt: string;
  enviadoEm: string | null;
  pagoEm: string | null;
}

interface Props {
  rows: CobrancaRSRow[];
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  pendente_revisao: { label: "Pendente de revisão", bg: "#FEF3C7", color: "#92400E" },
  aprovada_enviada: { label: "Enviada", bg: "#DBEAFE", color: "#1D4ED8" },
  paga: { label: "Paga", bg: "#DCFCE7", color: "#166534" },
  cancelada: { label: "Cancelada", bg: "#F3F4F6", color: "#6B7280" },
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

type FiltroTab = "pendente_revisao" | "aprovada_enviada" | "paga" | "todas";

export default function CobrancasRSPageClient({ rows: rowsIniciais }: Props) {
  const [rows, setRows] = useState(rowsIniciais);
  const [tab, setTab] = useState<FiltroTab>("pendente_revisao");
  const [cobrancaAberta, setCobrancaAberta] = useState<CobrancaRSRow | null>(null);

  const contagens = useMemo(
    () => ({
      pendente_revisao: rows.filter((r) => r.status === "pendente_revisao").length,
      aprovada_enviada: rows.filter((r) => r.status === "aprovada_enviada").length,
      paga: rows.filter((r) => r.status === "paga").length,
    }),
    [rows]
  );

  const filtradas = tab === "todas" ? rows : rows.filter((r) => r.status === tab);

  const handleAtualizada = (atualizada: CobrancaRSRow) => {
    setRows((prev) => prev.map((r) => (r.id === atualizada.id ? atualizada : r)));
    setCobrancaAberta(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cobranças R&S</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Rascunhos gerados automaticamente ao fechar vagas de Recrutamento e Seleção com candidato contratado
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {(
          [
            { key: "pendente_revisao" as const, label: "Pendentes de revisão", valor: contagens.pendente_revisao },
            { key: "aprovada_enviada" as const, label: "Enviadas", valor: contagens.aprovada_enviada },
            { key: "paga" as const, label: "Pagas", valor: contagens.paga },
          ]
        ).map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className="card text-center py-4"
            style={{ cursor: "pointer", border: tab === c.key ? "2px solid #000" : undefined }}
          >
            <p className="text-3xl font-bold text-black">{c.valor}</p>
            <p className="text-xs text-gray-500 mt-1">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-1 border-b-2 border-gray-100 mb-4">
        {(
          [
            { id: "pendente_revisao" as const, label: "Pendentes de revisão" },
            { id: "aprovada_enviada" as const, label: "Enviadas" },
            { id: "paga" as const, label: "Pagas" },
            { id: "todas" as const, label: "Todas" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px", fontWeight: tab === t.id ? 700 : 500, fontSize: 14,
              color: tab === t.id ? "#111827" : "#6B7280", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid #FFB800" : "2px solid transparent", marginBottom: -2, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
              {["Cliente", "Candidato", "Vaga", "Fee %", "Status", "Criada em"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px 12px", textAlign: "center", color: "#9CA3AF" }}>
                  Nenhuma cobrança nessa categoria.
                </td>
              </tr>
            ) : (
              filtradas.map((r) => {
                const statusInfo = STATUS_LABEL[r.status] ?? STATUS_LABEL.pendente_revisao;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setCobrancaAberta(r)}
                    style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{r.clienteNomeSnapshot}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{r.candidatoNomeSnapshot}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{r.vagaTitulo}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{r.feePercentual != null ? `${r.feePercentual}%` : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: statusInfo.bg, color: statusInfo.color }}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6B7280" }}>{formatarData(r.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {cobrancaAberta && (
        <ModalRevisaoCobrancaRS
          cobrancaId={cobrancaAberta.id}
          onClose={() => setCobrancaAberta(null)}
          onAtualizada={handleAtualizada}
        />
      )}
    </div>
  );
}
