"use client";

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlaConfig {
  id: string;
  etapa: string;
  prazo_dias_uteis: number;
  ativo: boolean;
}

interface SlaDestinatario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

type RowStatus = "idle" | "saving" | "ok" | "error";

// ── Constants ─────────────────────────────────────────────────────────────────

const ETAPA_LABEL: Record<string, string> = {
  triagem:             "Triagem",
  entrevista_rh:       "Entrevista RH",
  entrevista_cliente:  "Entrevista Cliente",
  proposta:            "Proposta",
  sem_movimentacao:    "Sem Movimentação (geral)",
};

// ── Shared style tokens ───────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#FFB800",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  display: "block",
  marginBottom: 4,
};

const thStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 11,
  fontWeight: 700,
  color: "#FFB800",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  borderBottom: "2px solid #F3F4F6",
  textAlign: "left",
  whiteSpace: "nowrap",
};

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        background: checked ? "#534AB7" : "#D1D5DB",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }}
      />
    </button>
  );
}

// ── Row status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status, erro }: { status: RowStatus; erro?: string }) {
  if (status === "idle") return null;
  if (status === "saving") return (
    <span style={{ fontSize: 12, color: "#9CA3AF" }}>Salvando…</span>
  );
  if (status === "ok") return (
    <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>✓ Salvo</span>
  );
  return (
    <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }} title={erro}>
      Erro
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SlaConfigPage() {
  // ── Configs state ──────────────────────────────────────────────────────────
  const [configs, setConfigs]       = useState<SlaConfig[]>([]);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgErroGlobal, setCfgErroGlobal] = useState("");

  // Per-row editable values
  const [editPrazo, setEditPrazo] = useState<Record<string, number>>({});
  const [editAtivo, setEditAtivo] = useState<Record<string, boolean>>({});
  const [cfgStatus, setCfgStatus] = useState<Record<string, RowStatus>>({});
  const [cfgErro,   setCfgErro]   = useState<Record<string, string>>({});

  // ── Destinatários state ────────────────────────────────────────────────────
  const [destinatarios, setDestinatarios] = useState<SlaDestinatario[]>([]);
  const [destLoading, setDestLoading]     = useState(true);
  const [destErroGlobal, setDestErroGlobal] = useState("");

  const [destStatus, setDestStatus] = useState<Record<string, RowStatus>>({});
  const [destErro,   setDestErro]   = useState<Record<string, string>>({});

  // Add form
  const [novoNome,   setNovoNome]   = useState("");
  const [novoEmail,  setNovoEmail]  = useState("");
  const [addStatus,  setAddStatus]  = useState<RowStatus>("idle");
  const [addErro,    setAddErro]    = useState("");

  // ── Fetch configs ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/sla/config")
      .then((r) => r.json())
      .then(({ data, error: e }) => {
        if (e) { setCfgErroGlobal(e); return; }
        const rows: SlaConfig[] = data ?? [];
        setConfigs(rows);
        const prazo: Record<string, number>  = {};
        const ativo: Record<string, boolean> = {};
        rows.forEach((r) => { prazo[r.id] = r.prazo_dias_uteis; ativo[r.id] = r.ativo; });
        setEditPrazo(prazo);
        setEditAtivo(ativo);
      })
      .catch(() => setCfgErroGlobal("Erro ao carregar configurações."))
      .finally(() => setCfgLoading(false));
  }, []);

  // ── Fetch destinatários ────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/sla/destinatarios")
      .then((r) => r.json())
      .then(({ data, error: e }) => {
        if (e) { setDestErroGlobal(e); return; }
        setDestinatarios(data ?? []);
      })
      .catch(() => setDestErroGlobal("Erro ao carregar destinatários."))
      .finally(() => setDestLoading(false));
  }, []);

  // ── Save config row ────────────────────────────────────────────────────────

  async function salvarConfig(id: string) {
    setCfgStatus((s) => ({ ...s, [id]: "saving" }));
    setCfgErro((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch("/api/sla/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          prazo_dias_uteis: editPrazo[id],
          ativo: editAtivo[id],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setConfigs((prev) =>
        prev.map((c) => (c.id === id ? { ...c, prazo_dias_uteis: editPrazo[id], ativo: editAtivo[id] } : c))
      );
      setCfgStatus((s) => ({ ...s, [id]: "ok" }));
      setTimeout(() => setCfgStatus((s) => ({ ...s, [id]: "idle" })), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCfgErro((e) => ({ ...e, [id]: msg }));
      setCfgStatus((s) => ({ ...s, [id]: "error" }));
    }
  }

  // ── Toggle destinatário ativo ──────────────────────────────────────────────

  async function toggleDest(id: string, ativo: boolean) {
    setDestStatus((s) => ({ ...s, [id]: "saving" }));
    setDestErro((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/sla/destinatarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setDestinatarios((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ativo } : d))
      );
      setDestStatus((s) => ({ ...s, [id]: "ok" }));
      setTimeout(() => setDestStatus((s) => ({ ...s, [id]: "idle" })), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDestErro((e) => ({ ...e, [id]: msg }));
      setDestStatus((s) => ({ ...s, [id]: "error" }));
    }
  }

  // ── Delete destinatário ────────────────────────────────────────────────────

  async function deletarDest(id: string, nome: string) {
    if (!confirm(`Remover "${nome}" dos destinatários de alertas SLA?`)) return;
    setDestStatus((s) => ({ ...s, [id]: "saving" }));
    try {
      const res = await fetch(`/api/sla/destinatarios/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setDestinatarios((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDestErro((e) => ({ ...e, [id]: msg }));
      setDestStatus((s) => ({ ...s, [id]: "error" }));
    }
  }

  // ── Add destinatário ───────────────────────────────────────────────────────

  async function adicionarDest(e: React.FormEvent) {
    e.preventDefault();
    setAddStatus("saving");
    setAddErro("");
    try {
      const res = await fetch("/api/sla/destinatarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome, email: novoEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setDestinatarios((prev) => [...prev, json.data]);
      setNovoNome("");
      setNovoEmail("");
      setAddStatus("ok");
      setTimeout(() => setAddStatus("idle"), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddErro(msg);
      setAddStatus("error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Configurações de SLA
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Defina prazos por etapa e gerencie os destinatários dos alertas automáticos
        </p>
      </div>

      {/* ── SECTION 1: Prazos por Etapa ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: "#534AB71A", color: "#534AB7",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
          </div>
          <div>
            <p className="section-title" style={{ margin: 0 }}>Prazos por Etapa</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
              Dias úteis antes de gerar um alerta de SLA
            </p>
          </div>
        </div>

        {cfgErroGlobal ? (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "12px 16px", borderRadius: 8, fontSize: 14 }}>
            {cfgErroGlobal}
          </div>
        ) : cfgLoading ? (
          <LoadingRow />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Etapa</th>
                  <th style={{ ...thStyle, textAlign: "center", width: 160 }}>Prazo (dias úteis)</th>
                  <th style={{ ...thStyle, textAlign: "center", width: 100 }}>Ativo</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 140 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((cfg) => {
                  const saving = cfgStatus[cfg.id] === "saving";
                  const changed =
                    editPrazo[cfg.id] !== cfg.prazo_dias_uteis ||
                    editAtivo[cfg.id] !== cfg.ativo;
                  return (
                    <tr key={cfg.id} style={{ borderBottom: "1px solid #F9FAFB" }}>
                      {/* Etapa */}
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                          {ETAPA_LABEL[cfg.etapa] ?? cfg.etapa}
                        </span>
                        <span style={{ fontSize: 11, color: "#9CA3AF", display: "block" }}>
                          {cfg.etapa}
                        </span>
                      </td>

                      {/* Prazo input */}
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={editPrazo[cfg.id] ?? cfg.prazo_dias_uteis}
                          onChange={(e) =>
                            setEditPrazo((p) => ({
                              ...p,
                              [cfg.id]: Math.min(30, Math.max(1, Number(e.target.value))),
                            }))
                          }
                          disabled={saving}
                          className="input-field"
                          style={{
                            width: 80,
                            textAlign: "center",
                            padding: "6px 8px",
                            fontSize: 15,
                            fontWeight: 700,
                          }}
                        />
                      </td>

                      {/* Ativo toggle */}
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <Toggle
                            checked={editAtivo[cfg.id] ?? cfg.ativo}
                            onChange={(v) => setEditAtivo((a) => ({ ...a, [cfg.id]: v }))}
                            disabled={saving}
                          />
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                          <StatusBadge status={cfgStatus[cfg.id] ?? "idle"} erro={cfgErro[cfg.id]} />
                          <button
                            onClick={() => salvarConfig(cfg.id)}
                            disabled={saving || !changed}
                            style={{
                              padding: "6px 16px",
                              borderRadius: 8,
                              border: "none",
                              background: changed ? "#111827" : "#F3F4F6",
                              color: changed ? "#FFD700" : "#9CA3AF",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: saving || !changed ? "not-allowed" : "pointer",
                              transition: "all 0.15s",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {saving ? "Salvando…" : "Salvar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SECTION 2: Destinatários ──────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: "#10B9811A", color: "#10B981",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="section-title" style={{ margin: 0 }}>Destinatários dos Alertas</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
              Quem recebe os alertas quando um SLA é excedido
            </p>
          </div>
        </div>

        {destErroGlobal ? (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "12px 16px", borderRadius: 8, fontSize: 14 }}>
            {destErroGlobal}
          </div>
        ) : destLoading ? (
          <LoadingRow />
        ) : (
          <>
            {destinatarios.length === 0 ? (
              <p style={{ fontSize: 14, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>
                Nenhum destinatário cadastrado
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginBottom: 24 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Nome</th>
                      <th style={thStyle}>E-mail</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 100 }}>Ativo</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 120 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destinatarios.map((dest) => {
                      const saving = destStatus[dest.id] === "saving";
                      return (
                        <tr key={dest.id} style={{ borderBottom: "1px solid #F9FAFB" }}>
                          {/* Nome */}
                          <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 600, color: "#111827" }}>
                            {dest.nome}
                          </td>

                          {/* Email */}
                          <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>
                            {dest.email}
                          </td>

                          {/* Toggle */}
                          <td style={{ padding: "11px 14px", textAlign: "center" }}>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              <Toggle
                                checked={dest.ativo}
                                onChange={(v) => toggleDest(dest.id, v)}
                                disabled={saving}
                              />
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "11px 14px", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                              {destStatus[dest.id] === "saving" && (
                                <span style={{ fontSize: 12, color: "#9CA3AF" }}>…</span>
                              )}
                              {destStatus[dest.id] === "error" && (
                                <span style={{ fontSize: 12, color: "#EF4444" }} title={destErro[dest.id]}>Erro</span>
                              )}
                              <button
                                onClick={() => deletarDest(dest.id, dest.nome)}
                                disabled={saving}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 7,
                                  border: "1px solid #FCA5A5",
                                  background: "#fff",
                                  color: "#DC2626",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: saving ? "not-allowed" : "pointer",
                                  opacity: saving ? 0.5 : 1,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Remover
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Add form ─────────────────────────────────────────────────── */}
            <div
              style={{
                borderTop: destinatarios.length > 0 ? "1px solid #F3F4F6" : "none",
                paddingTop: destinatarios.length > 0 ? 20 : 0,
              }}
            >
              <p style={{ ...labelStyle, marginBottom: 12 }}>Adicionar Destinatário</p>
              <form onSubmit={adicionarDest}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", flex: "1 1 180px", minWidth: 160 }}>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>Nome</label>
                    <input
                      type="text"
                      placeholder="Ex: Ana"
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      className="input-field"
                      style={{ padding: "8px 12px" }}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", flex: "2 1 220px", minWidth: 180 }}>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>E-mail</label>
                    <input
                      type="email"
                      placeholder="Ex: ana@salmazos.com.br"
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                      className="input-field"
                      style={{ padding: "8px 12px" }}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addStatus === "saving"}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 8,
                      border: "none",
                      background: "#111827",
                      color: "#FFD700",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: addStatus === "saving" ? "not-allowed" : "pointer",
                      opacity: addStatus === "saving" ? 0.7 : 1,
                      whiteSpace: "nowrap",
                      alignSelf: "flex-end",
                    }}
                  >
                    {addStatus === "saving" ? "Adicionando…" : "Adicionar"}
                  </button>
                </div>

                {/* Form feedback */}
                {addStatus === "ok" && (
                  <p style={{ fontSize: 13, color: "#10B981", fontWeight: 600, marginTop: 10, marginBottom: 0 }}>
                    ✓ Destinatário adicionado com sucesso
                  </p>
                )}
                {addStatus === "error" && (
                  <p style={{ fontSize: 13, color: "#EF4444", marginTop: 10, marginBottom: 0 }}>
                    {addErro}
                  </p>
                )}
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Loading placeholder ───────────────────────────────────────────────────────

function LoadingRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#9CA3AF", padding: "20px 0" }}>
      <span
        style={{
          width: 16, height: 16, borderRadius: "50%",
          border: "2px solid #FFD700", borderTopColor: "transparent",
          display: "inline-block", animation: "sla-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes sla-spin { to { transform: rotate(360deg); } }`}</style>
      Carregando…
    </div>
  );
}
