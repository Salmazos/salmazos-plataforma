"use client";

import { useMemo, useState } from "react";

export interface ClienteSupervisaoRow {
  metaId: string;
  clienteId: string;
  clienteNome: string;
  clienteAtivo: boolean;
  frequenciaDias: number;
  supervisorResponsavelId: string | null;
  supervisorResponsavelNome: string | null;
  modo: "padrao" | "implantacao";
  dataFimImplantacao: string | null;
  ultimaVisitaData: string | null;
  ultimaVisitaAnalistaId: string | null;
  ultimaVisitaAnalistaNome: string | null;
  diasDesde: number | null;
  badge: "em_dia" | "atrasado" | "nunca";
  coberturaEventual: boolean;
}

export interface RankingEntry {
  analistaId: string;
  nome: string;
  total: number;
}

interface Props {
  rows: ClienteSupervisaoRow[];
  ranking: RankingEntry[];
  supervisores: { id: string; nome: string }[];
  fullAccess: boolean;
}

const BADGE_INFO: Record<ClienteSupervisaoRow["badge"], { label: string; bg: string; color: string }> = {
  em_dia: { label: "Em dia", bg: "#D1FAE5", color: "#065F46" },
  atrasado: { label: "Atrasado", bg: "#FEE2E2", color: "#991B1B" },
  nunca: { label: "Nunca supervisionado", bg: "#F3F4F6", color: "#6B7280" },
};

const thStyle: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, color: "#FFB800", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "2px solid #F3F4F6", whiteSpace: "nowrap", textAlign: "left",
};
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#374151" };

function diasRestantesImplantacao(dataFim: string | null): number | null {
  if (!dataFim) return null;
  const [ano, mes, dia] = dataFim.split("-").map(Number);
  const fim = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.ceil((fim.getTime() - hoje.getTime()) / 86400000);
}

export default function SupervisaoPainelClient({ rows, ranking, supervisores, fullAccess }: Props) {
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroSupervisor, setFiltroSupervisor] = useState<string>("todos");
  const [filtroModo, setFiltroModo] = useState<string>("todos");
  const [abaRanking, setAbaRanking] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filtroStatus !== "todos" && r.badge !== filtroStatus) return false;
      if (filtroSupervisor !== "todos" && r.supervisorResponsavelId !== filtroSupervisor) return false;
      if (filtroModo !== "todos" && r.modo !== filtroModo) return false;
      return true;
    });
  }, [rows, filtroStatus, filtroSupervisor, filtroModo]);

  const counts = useMemo(() => ({
    em_dia: rows.filter((r) => r.badge === "em_dia").length,
    atrasado: rows.filter((r) => r.badge === "atrasado").length,
    nunca: rows.filter((r) => r.badge === "nunca").length,
  }), [rows]);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { title: "Total de Clientes", value: rows.length, accent: "#FFD700" },
          { title: "Em Dia", value: counts.em_dia, accent: "#10B981" },
          { title: "Atrasados", value: counts.atrasado, accent: "#DC2626" },
          { title: "Nunca Supervisionados", value: counts.nunca, accent: "#6B7280" },
        ].map((card) => (
          <div key={card.title} style={{ background: "#F9FAFB", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{card.title}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>{card.value}</p>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: card.accent, borderRadius: "0 0 12px 12px" }} />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #E5E7EB" }}>
        <button
          onClick={() => setAbaRanking(false)}
          style={{ padding: "10px 16px", border: "none", background: "none", borderBottom: !abaRanking ? "2px solid #FFD700" : "2px solid transparent", fontWeight: 700, fontSize: 13, color: !abaRanking ? "#111827" : "#9CA3AF", cursor: "pointer" }}
        >
          Clientes
        </button>
        <button
          onClick={() => setAbaRanking(true)}
          style={{ padding: "10px 16px", border: "none", background: "none", borderBottom: abaRanking ? "2px solid #FFD700" : "2px solid transparent", fontWeight: 700, fontSize: 13, color: abaRanking ? "#111827" : "#9CA3AF", cursor: "pointer" }}
        >
          Ranking do Mês
        </button>
      </div>

      {abaRanking ? (
        <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFAFA" }}>
                <th style={thStyle}>Supervisor</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Supervisões no mês</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr><td colSpan={2} style={{ padding: "32px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Nenhuma supervisão registrada este mês.</td></tr>
              ) : (
                ranking.map((r) => (
                  <tr key={r.analistaId} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>{r.nome}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{r.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13 }}>
              <option value="todos">Todos os status</option>
              <option value="em_dia">Em dia</option>
              <option value="atrasado">Atrasado</option>
              <option value="nunca">Nunca supervisionado</option>
            </select>
            {fullAccess && (
              <select value={filtroSupervisor} onChange={(e) => setFiltroSupervisor(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13 }}>
                <option value="todos">Todos os supervisores</option>
                {supervisores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            )}
            <select value={filtroModo} onChange={(e) => setFiltroModo(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13 }}>
              <option value="todos">Todos os modos</option>
              <option value="padrao">Padrão</option>
              <option value="implantacao">Em implantação</option>
            </select>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFAFA" }}>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Supervisor</th>
                  <th style={thStyle}>Última Supervisão</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Modo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Nenhum cliente encontrado.</td></tr>
                ) : (
                  filtered.map((r) => {
                    const badgeInfo = BADGE_INFO[r.badge];
                    const diasImpl = r.modo === "implantacao" ? diasRestantesImplantacao(r.dataFimImplantacao) : null;
                    return (
                      <tr key={r.metaId} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>
                          {r.clienteNome}
                          {!r.clienteAtivo && <span style={{ marginLeft: 6, fontSize: 10, color: "#9CA3AF" }}>(inativo)</span>}
                        </td>
                        <td style={tdStyle}>{r.supervisorResponsavelNome ?? "—"}</td>
                        <td style={tdStyle}>
                          {r.ultimaVisitaData ? (
                            <>
                              {r.ultimaVisitaData.split("-").reverse().join("/")} ({r.diasDesde}d atrás)
                              {r.coberturaEventual && (
                                <div style={{ fontSize: 11, color: "#B45309", fontWeight: 600, marginTop: 2 }}>
                                  Cobertura eventual — por {r.ultimaVisitaAnalistaNome}
                                </div>
                              )}
                            </>
                          ) : "—"}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: badgeInfo.bg, color: badgeInfo.color }}>
                            {badgeInfo.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {r.modo === "implantacao" ? (
                            <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#DBEAFE", color: "#1E40AF" }}>
                              Em implantação{diasImpl !== null ? ` (${diasImpl}d restantes)` : ""}
                            </span>
                          ) : (
                            <span style={{ color: "#9CA3AF", fontSize: 12 }}>Padrão</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
