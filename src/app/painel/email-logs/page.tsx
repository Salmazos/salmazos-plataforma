"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailLog {
  id: string;
  created_at: string;
  destinatario: string;
  assunto: string | null;
  tipo: string;
  status: "enviado" | "erro";
  erro_mensagem: string | null;
  candidato_id: string | null;
  vaga_id: string | null;
  candidatos: { nome_completo: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  confirmacao_candidatura: "Confirmação",
  notificacao_analista:    "Notificação",
  outro:                   "Outro",
};

function tipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { from, to };
}

function daysAgoRange(days: number): { from: string; to: string } {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).toISOString();
  const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { from, to };
}

// ── Shared style tokens ───────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmailLogsPage() {
  const [logs, setLogs]           = useState<EmailLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]           = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  // Filters
  const [filtroStatus, setFiltroStatus] = useState<"" | "enviado" | "erro">("");
  const [filtroTipo, setFiltroTipo]     = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState<"hoje" | "7" | "30" | "todos">("todos");

  // ── Fetch ──────────────────────────────────────────────────────────────────

  function buildUrl() {
    const p = new URLSearchParams();
    if (filtroStatus) p.set("status", filtroStatus);
    if (filtroTipo)   p.set("tipo",   filtroTipo);
    if (filtroPeriodo === "hoje") {
      const { from, to } = todayRange();
      p.set("from", from);
      p.set("to",   to);
    } else if (filtroPeriodo === "7") {
      const { from, to } = daysAgoRange(7);
      p.set("from", from);
      p.set("to",   to);
    } else if (filtroPeriodo === "30") {
      const { from, to } = daysAgoRange(30);
      p.set("from", from);
      p.set("to",   to);
    }
    return `/api/email-logs?${p.toString()}`;
  }

  function carregar() {
    setCarregando(true);
    setErro("");
    fetch(buildUrl())
      .then((r) => r.json())
      .then(({ data, error: e }) => {
        if (e) { setErro(e); return; }
        setLogs(data ?? []);
      })
      .catch(() => setErro("Erro ao carregar logs."))
      .finally(() => setCarregando(false));
  }

  useEffect(() => { carregar(); }, [filtroStatus, filtroTipo, filtroPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Summary cards (based on all returned logs + today filter locally) ──────

  const { enviadosHoje, errosHoje } = useMemo(() => {
    const { from, to } = todayRange();
    const fromMs = new Date(from).getTime();
    const toMs   = new Date(to).getTime();
    const hoje = logs.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return t >= fromMs && t < toMs;
    });
    return {
      enviadosHoje: hoje.filter((l) => l.status === "enviado").length,
      errosHoje:    hoje.filter((l) => l.status === "erro").length,
    };
  }, [logs]);

  // Tipos available for filter dropdown
  const tiposDisponiveis = useMemo(() => {
    const set = new Set(logs.map((l) => l.tipo));
    return Array.from(set).sort();
  }, [logs]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
            Log de E-mails
          </h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
            Histórico de envios e erros de e-mail
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={carregando}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8,
            background: "#111827", color: "#FFD700",
            border: "none", cursor: carregando ? "not-allowed" : "pointer",
            fontSize: 14, fontWeight: 600, opacity: carregando ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
        <SummaryCard
          label="Enviados hoje"
          value={enviadosHoje}
          color="#10B981"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SummaryCard
          label="Erros hoje"
          value={errosHoje}
          color="#EF4444"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SummaryCard
          label="Total carregado"
          value={logs.length}
          color="#534AB7"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>

          {/* Status chips */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Status</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["", "enviado", "erro"] as const).map((s) => {
                const active = filtroStatus === s;
                const label  = s === "" ? "Todos" : s === "enviado" ? "Enviado" : "Erro";
                const color  = s === "enviado" ? "#10B981" : s === "erro" ? "#EF4444" : "#111827";
                const bg     = s === "enviado" ? "#D1FAE5" : s === "erro" ? "#FEE2E2" : "#F3F4F6";
                return (
                  <button
                    key={s}
                    onClick={() => setFiltroStatus(s)}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 20,
                      border: `1.5px solid ${active ? color : "#E5E7EB"}`,
                      background: active ? bg : "#fff",
                      color: active ? color : "#6B7280",
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tipo */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 160 }}>
            <label style={labelStyle}>Tipo</label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="input-field"
              style={{ paddingTop: 7, paddingBottom: 7 }}
            >
              <option value="">Todos</option>
              {tiposDisponiveis.map((t) => (
                <option key={t} value={t}>{tipoLabel(t)}</option>
              ))}
            </select>
          </div>

          {/* Período chips */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Período</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["hoje", "7", "30", "todos"] as const).map((p) => {
                const active = filtroPeriodo === p;
                const label  = p === "hoje" ? "Hoje" : p === "7" ? "7 dias" : p === "30" ? "30 dias" : "Todos";
                return (
                  <button
                    key={p}
                    onClick={() => setFiltroPeriodo(p)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      border: `1.5px solid ${active ? "#111827" : "#E5E7EB"}`,
                      background: active ? "#111827" : "#fff",
                      color: active ? "#FFD700" : "#6B7280",
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* ── Table card ───────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p className="section-title" style={{ margin: 0 }}>Registros</p>
          <span style={{ fontSize: 13, color: "#9CA3AF" }}>
            {logs.length} registro{logs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {erro ? (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "12px 16px", borderRadius: 8, fontSize: 14 }}>
            {erro}
          </div>
        ) : carregando ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#9CA3AF", padding: "32px 0" }}>
            <span
              style={{
                width: 18, height: 18, borderRadius: "50%",
                border: "2px solid #FFD700", borderTopColor: "transparent",
                display: "inline-block", animation: "emaillogs-spin 0.7s linear infinite",
              }}
            />
            Carregando logs...
          </div>
        ) : logs.length === 0 ? (
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
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Nenhum registro encontrado</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Data / Hora</th>
                  <th style={thStyle}>Destinatário</th>
                  <th style={{ ...thStyle, maxWidth: 220 }}>Assunto</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Candidato</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Erro</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isErro     = log.status === "erro";
                  const hasErro    = isErro && !!log.erro_mensagem;
                  const isExpanded = expandido === log.id;

                  return (
                    <>
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: isExpanded ? "none" : "1px solid #F9FAFB",
                          background: isExpanded ? "#FFFBEB" : "transparent",
                        }}
                      >
                        {/* Data/Hora */}
                        <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                          {fmtDatetime(log.created_at)}
                        </td>

                        {/* Destinatário */}
                        <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                          {log.destinatario}
                        </td>

                        {/* Assunto */}
                        <td style={{ padding: "10px 12px", maxWidth: 220 }}>
                          <span
                            style={{
                              display: "block", fontSize: 13, color: "#6B7280",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                            title={log.assunto ?? ""}
                          >
                            {log.assunto ?? "—"}
                          </span>
                        </td>

                        {/* Tipo */}
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 12, fontWeight: 600,
                              background: "#F3F4F6", color: "#374151",
                              padding: "2px 10px", borderRadius: 10,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tipoLabel(log.tipo)}
                          </span>
                        </td>

                        {/* Candidato */}
                        <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                          {log.candidato_id && log.candidatos ? (
                            <Link
                              href={`/painel/candidato/${log.candidato_id}`}
                              style={{ color: "#534AB7", fontWeight: 500, textDecoration: "none" }}
                            >
                              {log.candidatos.nome_completo}
                            </Link>
                          ) : "—"}
                        </td>

                        {/* Status badge */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: 12, fontWeight: 700,
                              padding: "3px 10px", borderRadius: 12,
                              background: isErro ? "#FEE2E2" : "#D1FAE5",
                              color:      isErro ? "#991B1B" : "#065F46",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isErro ? "Erro" : "Enviado"}
                          </span>
                        </td>

                        {/* Erro column */}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {hasErro ? (
                            <button
                              onClick={() => setExpandido(isExpanded ? null : log.id)}
                              title={log.erro_mensagem ?? ""}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "#EF4444", display: "inline-flex", alignItems: "center",
                                gap: 4, fontSize: 12, fontWeight: 600,
                              }}
                            >
                              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {isExpanded ? "Ocultar" : "Ver"}
                            </button>
                          ) : (
                            <span style={{ color: "#D1D5DB", fontSize: 13 }}>—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded error row */}
                      {isExpanded && (
                        <tr key={`${log.id}-err`} style={{ background: "#FFFBEB", borderBottom: "1px solid #F9FAFB" }}>
                          <td colSpan={7} style={{ padding: "0 12px 12px 12px" }}>
                            <div
                              style={{
                                background: "#FEE2E2", color: "#7F1D1D",
                                padding: "10px 14px", borderRadius: 8,
                                fontSize: 13, fontFamily: "monospace",
                                wordBreak: "break-all", lineHeight: 1.6,
                              }}
                            >
                              {log.erro_mensagem}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes emaillogs-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Summary card sub-component ────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px" }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: color + "1A",
          color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 26, fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1.2 }}>
          {value}
        </p>
      </div>
    </div>
  );
}
