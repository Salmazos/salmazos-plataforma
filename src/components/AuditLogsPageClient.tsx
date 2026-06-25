"use client";

import { Fragment, useState, useMemo } from "react";
import type { AuditLog } from "@/app/painel/audit-logs/page";

// ── Badge config ───────────────────────────────────────────────────────────────

const ACAO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  candidato_criado:        { bg: "#D1FAE5", color: "#065F46", label: "Candidato Criado" },
  candidato_etapa_alterada:{ bg: "#DBEAFE", color: "#1E40AF", label: "Etapa Alterada" },
  candidato_finalizado:    { bg: "#EDE9FE", color: "#5B21B6", label: "Candidato Finalizado" },
  vaga_criada:             { bg: "#FEF3C7", color: "#92400E", label: "Vaga Criada" },
  vaga_atualizada:         { bg: "#FFEDD5", color: "#9A3412", label: "Vaga Atualizada" },
  usuario_criado:          { bg: "#CCFBF1", color: "#134E4A", label: "Usuário Criado" },
  usuario_excluido:        { bg: "#FEE2E2", color: "#991B1B", label: "Usuário Excluído" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function truncateId(id: string | null): string {
  if (!id) return "—";
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

// ── Style tokens ──────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#FFB800",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 4,
  display: "block",
};

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 11,
  color: "#FFB800",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  borderBottom: "2px solid #F3F4F6",
  whiteSpace: "nowrap",
  textAlign: "left",
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1.5px solid #E5E7EB",
  fontSize: 13,
  color: "#111827",
  background: "#fff",
  outline: "none",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuditLogsPageClient({ logs }: { logs: AuditLog[] }) {
  const [filtroAcao, setFiltroAcao]       = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroDe, setFiltroDe]           = useState("");
  const [filtroAte, setFiltroAte]         = useState("");
  const [expandido, setExpandido]         = useState<string | null>(null);

  // Unique acoes for the select
  const acoesDisponiveis = useMemo(() => {
    const set = new Set(logs.map((l) => l.acao));
    return Array.from(set).sort();
  }, [logs]);

  // Client-side filtering
  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (filtroAcao && log.acao !== filtroAcao) return false;
      if (filtroUsuario) {
        const nome = (log.usuario_nome ?? "").toLowerCase();
        if (!nome.includes(filtroUsuario.toLowerCase())) return false;
      }
      if (filtroDe) {
        if (new Date(log.created_at) < new Date(filtroDe + "T00:00:00")) return false;
      }
      if (filtroAte) {
        if (new Date(log.created_at) > new Date(filtroAte + "T23:59:59")) return false;
      }
      return true;
    });
  }, [logs, filtroAcao, filtroUsuario, filtroDe, filtroAte]);

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Audit Logs
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Registro de ações críticas na plataforma
        </p>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>

          {/* Período De */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>De</label>
            <input
              type="date"
              value={filtroDe}
              onChange={(e) => setFiltroDe(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Período Até */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Até</label>
            <input
              type="date"
              value={filtroAte}
              onChange={(e) => setFiltroAte(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Ação */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 200 }}>
            <label style={labelStyle}>Ação</label>
            <select
              value={filtroAcao}
              onChange={(e) => setFiltroAcao(e.target.value)}
              style={{ ...inputStyle, minWidth: 200 }}
            >
              <option value="">Todas as ações</option>
              {acoesDisponiveis.map((a) => (
                <option key={a} value={a}>
                  {ACAO_BADGE[a]?.label ?? a}
                </option>
              ))}
            </select>
          </div>

          {/* Usuário */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 180 }}>
            <label style={labelStyle}>Usuário</label>
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              style={{ ...inputStyle, minWidth: 180 }}
            />
          </div>

          {/* Clear */}
          {(filtroAcao || filtroUsuario || filtroDe || filtroAte) && (
            <button
              onClick={() => {
                setFiltroAcao("");
                setFiltroUsuario("");
                setFiltroDe("");
                setFiltroAte("");
              }}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "1.5px solid #E5E7EB",
                background: "#fff",
                color: "#6B7280",
                fontSize: 13,
                cursor: "pointer",
                alignSelf: "flex-end",
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Table card ───────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p className="section-title" style={{ margin: 0 }}>Registros</p>
          <span style={{ fontSize: 13, color: "#9CA3AF" }}>
            {filtered.length} de {logs.length} registro{logs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {logs.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF", fontSize: 14 }}>
            Nenhum registro corresponde aos filtros aplicados.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Data / Hora</th>
                  <th style={thStyle}>Usuário</th>
                  <th style={thStyle}>Ação</th>
                  <th style={thStyle}>Entidade</th>
                  <th style={thStyle}>ID</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const badge      = ACAO_BADGE[log.acao];
                  const isExpanded = expandido === log.id;
                  const hasDetails = !!log.detalhes && Object.keys(log.detalhes).length > 0;

                  return (
                    <Fragment key={log.id}>
                      <tr
                        style={{
                          borderBottom: isExpanded ? "none" : "1px solid #F9FAFB",
                          background: isExpanded ? "#F5F3FF" : "transparent",
                          transition: "background 0.1s",
                        }}
                      >
                        {/* Data/Hora */}
                        <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                          {fmtDatetime(log.created_at)}
                        </td>

                        {/* Usuário */}
                        <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                          {log.usuario_nome ?? (
                            <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>Sistema</span>
                          )}
                        </td>

                        {/* Ação badge */}
                        <td style={{ padding: "10px 12px" }}>
                          {badge ? (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "3px 10px",
                                borderRadius: 12,
                                background: badge.bg,
                                color: badge.color,
                                whiteSpace: "nowrap",
                                letterSpacing: "0.02em",
                              }}
                            >
                              {badge.label}
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "3px 10px",
                                borderRadius: 12,
                                background: "#F3F4F6",
                                color: "#374151",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {log.acao}
                            </span>
                          )}
                        </td>

                        {/* Entidade */}
                        <td style={{ padding: "10px 12px", fontSize: 13, color: "#6B7280", whiteSpace: "nowrap" }}>
                          {log.entidade}
                        </td>

                        {/* ID */}
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            title={log.entidade_id ?? ""}
                            style={{
                              fontSize: 12,
                              color: "#9CA3AF",
                              fontFamily: "monospace",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {truncateId(log.entidade_id)}
                          </span>
                        </td>

                        {/* Detalhes toggle */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {hasDetails ? (
                            <button
                              onClick={() => setExpandido(isExpanded ? null : log.id)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#534AB7",
                                fontSize: 12,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                viewBox="0 0 24 24"
                                style={{
                                  transition: "transform 0.15s",
                                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                }}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                              {isExpanded ? "Ocultar" : "Ver"}
                            </button>
                          ) : (
                            <span style={{ color: "#D1D5DB", fontSize: 13 }}>—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded details row */}
                      {isExpanded && (
                        <tr style={{ background: "#F5F3FF", borderBottom: "1px solid #F9FAFB" }}>
                          <td colSpan={6} style={{ padding: "0 12px 12px 12px" }}>
                            <pre
                              style={{
                                margin: 0,
                                padding: "12px 16px",
                                background: "#1E1B4B",
                                color: "#A5B4FC",
                                borderRadius: 8,
                                fontSize: 12,
                                fontFamily: "monospace",
                                lineHeight: 1.7,
                                overflowX: "auto",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                              }}
                            >
                              {JSON.stringify(log.detalhes, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes audit-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "56px 0" }}>
      <div
        style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "#F3F4F6", margin: "0 auto 14px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="24" height="24" fill="none" stroke="#9CA3AF" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>
      <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Nenhum audit log registrado</p>
    </div>
  );
}
