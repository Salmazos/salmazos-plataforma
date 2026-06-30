"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Analista {
  id: string;
  nome_completo: string;
}

interface EmpresaVisitada {
  id: string;
  nome: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  cidade: string | null;
  cliente_id: string | null;
  primeira_visita_em: string;
  ultima_visita_em: string;
  total_visitas: number;
  ultimo_visitante_nome: string | null;
}

interface VisitaHistorico {
  id: string;
  empresa: string;
  contato: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  motivo: string | null;
  resultado: string | null;
  data: string | null;
  analista_nome: string | null;
}

interface Props {
  analistas: Analista[]; // available for future analista filter
}

const inputStyle: React.CSSProperties = {
  padding: "10px 14px", border: "1px solid #D1D5DB", borderRadius: 8,
  fontSize: 14, outline: "none", background: "#fff",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4,
};
const thStyle: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, color: "#FFB800", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "2px solid #F3F4F6", whiteSpace: "nowrap", textAlign: "left",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function EmpresasVisitadasClient({ analistas: _analistas }: Props) {
  const [empresas, setEmpresas] = useState<EmpresaVisitada[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historicos, setHistoricos] = useState<Record<string, VisitaHistorico[]>>({});
  const [loadingHistorico, setLoadingHistorico] = useState<string | null>(null);

  const loadEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/km/empresas-visitadas?${params}`);
      const json = await res.json();
      setEmpresas(json.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { loadEmpresas(); }, [loadEmpresas]);

  const toggleExpand = async (empresaId: string) => {
    if (expandedId === empresaId) { setExpandedId(null); return; }
    setExpandedId(empresaId);
    if (!historicos[empresaId]) {
      setLoadingHistorico(empresaId);
      try {
        const res = await fetch(`/api/km/empresas-visitadas?empresa_id=${empresaId}`);
        const json = await res.json();
        setHistoricos((prev) => ({ ...prev, [empresaId]: json.data ?? [] }));
      } catch { /* ignore */ } finally {
        setLoadingHistorico(null);
      }
    }
  };

  // Client-side search filter
  const filtered = empresas.filter((e) =>
    !search || e.nome.toLowerCase().includes(search.toLowerCase())
  );

  const totalEmpresas = empresas.length;
  const totalVisitas = empresas.reduce((s, e) => s + e.total_visitas, 0);
  const comCliente = empresas.filter((e) => e.cliente_id).length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Empresas Visitadas</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Base permanente de empresas prospectadas e visitadas</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { title: "Empresas Cadastradas", value: totalEmpresas, accent: "#FFD700" },
          { title: "Total de Visitas", value: totalVisitas, accent: "#3B82F6" },
          { title: "Vinculadas a Clientes", value: comCliente, accent: "#10B981" },
        ].map((card) => (
          <div key={card.title} className="card" style={{ position: "relative", overflow: "hidden", padding: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{card.title}</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>{card.value}</p>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: card.accent, borderRadius: "0 0 12px 12px" }} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={labelStyle}>Buscar empresa</label>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            placeholder="Nome da empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Última visita de</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>até</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} style={{ background: "none", border: "none", color: "#FFB800", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "10px 0" }}>
            Limpar
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: "#9CA3AF", fontSize: 14, textAlign: "center", padding: 60 }}>Carregando empresas...</p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFAFA" }}>
                <th style={thStyle}>Empresa</th>
                <th style={thStyle}>Contato</th>
                <th style={thStyle}>Telefone</th>
                <th style={thStyle}>E-mail</th>
                <th style={thStyle}>Cliente</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Última Visita</th>
                <th style={thStyle}>Visitado por</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Visitas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
                    {search ? `Nenhuma empresa encontrada para "${search}".` : "Nenhuma empresa visitada registrada ainda."}
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const isExpanded = expandedId === e.id;
                  const hist = historicos[e.id];
                  const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
                  return (
                    <React.Fragment key={e.id}>
                      <tr
                        style={{ borderBottom: isExpanded ? "none" : "1px solid #F3F4F6", cursor: "pointer", background: isExpanded ? "#FAFAFA" : undefined }}
                        onClick={() => toggleExpand(e.id)}
                      >
                        <td style={{ ...td, fontWeight: 600, color: "#111827" }}>
                          <span style={{ marginRight: 6, fontSize: 10, color: "#9CA3AF" }}>{isExpanded ? "▼" : "▶"}</span>
                          {e.nome}
                          {e.cidade && <span style={{ marginLeft: 6, fontSize: 11, color: "#9CA3AF" }}>{e.cidade}</span>}
                        </td>
                        <td style={td}>{e.contato_nome ?? "—"}</td>
                        <td style={td}>{e.contato_telefone ?? "—"}</td>
                        <td style={td}>{e.contato_email ? (
                          <a href={`mailto:${e.contato_email}`} style={{ color: "#3B82F6", textDecoration: "none" }} onClick={(ev) => ev.stopPropagation()}>
                            {e.contato_email}
                          </a>
                        ) : "—"}</td>
                        <td style={td}>
                          {e.cliente_id ? (
                            <a
                              href="/painel/clientes"
                              style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#FEF3C7", color: "#92400E", textDecoration: "none" }}
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              Cliente ↗
                            </a>
                          ) : (
                            <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "right", color: "#6B7280" }}>{formatDate(e.ultima_visita_em)}</td>
                        <td style={td}>{e.ultimo_visitante_nome ?? "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{e.total_visitas}</td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                          <td colSpan={8} style={{ padding: "12px 24px 16px", background: "#FAFAFA" }}>
                            {loadingHistorico === e.id ? (
                              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Carregando histórico...</p>
                            ) : hist && hist.length > 0 ? (
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
                                  Histórico de visitas ({hist.length})
                                </p>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr>
                                      {["Data", "Analista", "Contato", "Motivo", "Resultado"].map((h) => (
                                        <th key={h} style={{ padding: "4px 8px", fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {hist.map((v) => (
                                      <tr key={v.id} style={{ borderBottom: "1px solid #F9FAFB" }}>
                                        <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{formatDate(v.data)}</td>
                                        <td style={{ padding: "6px 8px", fontSize: 12, color: "#374151" }}>{v.analista_nome ?? "—"}</td>
                                        <td style={{ padding: "6px 8px", fontSize: 12, color: "#374151" }}>
                                          {v.contato ?? "—"}
                                          {v.contato_telefone && <span style={{ color: "#9CA3AF" }}> · {v.contato_telefone}</span>}
                                        </td>
                                        <td style={{ padding: "6px 8px", fontSize: 12, color: "#6B7280" }}>{v.motivo ?? "—"}</td>
                                        <td style={{ padding: "6px 8px", fontSize: 12, color: "#374151" }}>{v.resultado ?? "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Nenhum histórico disponível.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
