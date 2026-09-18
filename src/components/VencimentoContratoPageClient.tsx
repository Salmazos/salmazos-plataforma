"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatarDataSemFuso } from "@/lib/utils";
import type { ContratoMotFaixa } from "@/lib/contratoMotStatus";

export interface VencimentoContratoRow {
  id: string;
  nomeCompleto: string;
  clienteId: string | null;
  empresa: string;
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

interface ClienteOption {
  id: string;
  nome: string;
}

interface Props {
  linhasIniciais: VencimentoContratoRow[];
  clientesFiltro: ClienteOption[];
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

export default function VencimentoContratoPageClient({ linhasIniciais, clientesFiltro }: Props) {
  const [filtroClienteId, setFiltroClienteId] = useState("");
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return linhasIniciais.filter((l) => {
      if (filtroClienteId && l.clienteId !== filtroClienteId) return false;
      if (buscaLower && !l.nomeCompleto.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
  }, [linhasIniciais, filtroClienteId, busca]);

  const totalExcedido = useMemo(() => linhasIniciais.filter((l) => l.faixa === "limite_excedido").length, [linhasIniciais]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vencimento de Contrato</h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            Funcionários MOT ativos — prazos de renovação de 90, 180 e 270 dias (Lei 6.019/74)
          </p>
        </div>
        {totalExcedido > 0 && (
          <div
            style={{
              background: "#FEE2E2",
              color: "#991B1B",
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 8,
            }}
          >
            ⚠ {totalExcedido} contrato{totalExcedido > 1 ? "s" : ""} acima de 270 dias
          </div>
        )}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome..."
          className="input-field"
          style={{ maxWidth: 240 }}
        />
        <select value={filtroClienteId} onChange={(e) => setFiltroClienteId(e.target.value)} className="input-field" style={{ maxWidth: 260 }}>
          <option value="">Todas as empresas</option>
          {clientesFiltro.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {filtradas.length === 0 ? (
          <p style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF", margin: 0 }}>
            Nenhum funcionário MOT ativo encontrado.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Funcionário</th>
                <th style={TH_STYLE}>Empresa</th>
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
                  <td style={TD_STYLE}>
                    <Link href={`/painel/funcionarios/${l.id}`} style={{ color: "#111827", fontWeight: 700, textDecoration: "underline", textDecorationThickness: 1 }}>
                      {l.nomeCompleto}
                    </Link>
                  </td>
                  <td style={{ ...TD_STYLE, color: "#374151" }}>{l.empresa}</td>
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
