"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatarDataSemFuso } from "@/lib/utils";
import type { ContratoMotFaixa } from "@/lib/contratoMotStatus";

export interface VencimentoContratoPortalRow {
  id: string;
  nomeCompleto: string;
  dataAdmissao: string;
  diasTrabalhados: number;
  vencimento90: string;
  vencimento180: string;
  vencimento270: string;
  faixa: ContratoMotFaixa;
  proximoVencimento: string;
  diasParaProximoVencimento: number;
  bg: string;
  text: string;
  label: string;
}

interface Props {
  linhas: VencimentoContratoPortalRow[];
}

// Mesma técnica de remoção de acento usada em PortalFuncionariosListClient.tsx — busca
// ignora acento e caixa.
function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const TH_STYLE: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: 0.3,
  whiteSpace: "nowrap",
  borderBottom: "1px solid #E5E7EB",
};

const TD_STYLE: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "#111827",
  whiteSpace: "nowrap",
};

// Sem filtro por empresa (pedido explícito do Olver) — o cliente só vê os próprios
// funcionários, o filtro seria redundante. Só busca por nome, mesmo padrão de
// PortalFuncionariosListClient.tsx.
export default function VencimentoContratoPortalListClient({ linhas }: Props) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return linhas;
    return linhas.filter((l) => normalizarBusca(l.nomeCompleto).includes(termo));
  }, [busca, linhas]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:w-56">
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none"
            style={{ padding: "9px 12px 9px 36px" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#FFD700")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ overflowX: "auto" }}>
        {filtradas.length === 0 ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF", margin: 0 }}>
            Nenhum funcionário MOT ativo encontrado.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Funcionário</th>
                <th style={TH_STYLE}>Data de Admissão</th>
                <th style={TH_STYLE}>Dias Trabalhados</th>
                <th style={TH_STYLE}>Situação</th>
                <th style={TH_STYLE}>Vencimento 90 dias</th>
                <th style={TH_STYLE}>Vencimento 180 dias</th>
                <th style={TH_STYLE}>Vencimento 270 dias</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ ...TD_STYLE, fontWeight: 700 }}>{l.nomeCompleto}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.dataAdmissao)}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{l.diasTrabalhados}</td>
                  <td style={TD_STYLE}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: l.bg,
                        color: l.text,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.label}
                    </span>
                  </td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.vencimento90)}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.vencimento180)}</td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{formatarDataSemFuso(l.vencimento270)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
