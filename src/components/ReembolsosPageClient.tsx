"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Analista {
  id: string;
  nome_completo: string;
  avatar_url: string | null;
  cargo: string | null;
}

interface OutroCustoDB {
  tipo: string;
  descricao: string;
  valor: number;
  comprovante_url?: string;
}

interface KmRegistro {
  id: string;
  analista_id: string;
  data: string;
  km_inicial: number;
  km_final: number;
  km_rodados: number;
  tipo_servico: string | null;
  valor_por_km: number | null;
  valor_total: number | null;
  outros_custos: OutroCustoDB[] | null;
}

interface KmVisita {
  id: string;
  registro_id: string;
  empresa: string;
  contato: string | null;
  motivo: string | null;
  resultado: string | null;
  ordem: number;
}

interface Props {
  analistas: Analista[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const TIPOS_DESLOCAMENTO: Record<string, { label: string; color: string; bg: string }> = {
  visita: { label: "Visita (Comercial / Técnica / Supervisão)", color: "#3B82F6", bg: "#DBEAFE" },
  treinamento: { label: "Treinamento", color: "#8B5CF6", bg: "#EDE9FE" },
  diretoria: { label: "Diretoria", color: "#F59E0B", bg: "#FEF3C7" },
  outros: { label: "Outros", color: "#6B7280", bg: "#F3F4F6" },
};

const FALLBACK_TIPO = { label: "—", color: "#6B7280", bg: "#F3F4F6" };

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string): string {
  return d.split("-").reverse().join("/");
}

function ocSum(custos: OutroCustoDB[] | null): number {
  if (!custos) return 0;
  return custos.reduce((s, c) => s + c.valor, 0);
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

// ── Styles ───────────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

export default function ReembolsosPageClient({ analistas }: Props) {
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
  const [to, setTo] = useState(now.toISOString().split("T")[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [registros, setRegistros] = useState<KmRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [rowVisitas, setRowVisitas] = useState<Record<string, KmVisita[]>>({});
  const [loadingVisitas, setLoadingVisitas] = useState<string | null>(null);

  const loadRegistros = useCallback(async () => {
    setLoading(true);
    setExpandedRow(null);
    setRowVisitas({});
    try {
      if (selectedId) {
        const res = await fetch(
          `/api/km/registros?analista_id=${selectedId}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
        );
        const json = await res.json();
        setRegistros(json.data ?? []);
      } else {
        const results = await Promise.all(
          analistas.map((a) =>
            fetch(`/api/km/registros?analista_id=${a.id}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`)
              .then((r) => r.json())
              .then((j) => (j.data ?? []) as KmRegistro[])
          )
        );
        setRegistros(results.flat().sort((a, b) => b.data.localeCompare(a.data)));
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [selectedId, from, to, analistas]);

  useEffect(() => { loadRegistros(); }, [loadRegistros]);

  const toggleExpand = async (registroId: string) => {
    if (expandedRow === registroId) { setExpandedRow(null); return; }
    setExpandedRow(registroId);
    if (!rowVisitas[registroId]) {
      setLoadingVisitas(registroId);
      try {
        const res = await fetch(`/api/km/visitas?registro_id=${registroId}`);
        const json = await res.json();
        setRowVisitas((prev) => ({ ...prev, [registroId]: json.data ?? [] }));
      } catch { /* ignore */ } finally {
        setLoadingVisitas(null);
      }
    }
  };

  // ── Totals ──
  const totalKm = registros.reduce((s, r) => s + r.km_rodados, 0);
  const totalReembolso = registros.reduce((s, r) => s + (r.valor_total ?? 0), 0);
  const totalOutrosCustos = registros.reduce((s, r) => s + ocSum(r.outros_custos), 0);
  const totalGeral = totalReembolso + totalOutrosCustos;

  // ── Analyst name lookup ──
  const analistaMap = new Map(analistas.map((a) => [a.id, a]));

  const handleGerarPdf = async () => {
    setGeneratingPdf(true);
    try {
      const selectedAnalista = selectedId ? analistaMap.get(selectedId) : null;
      const res = await fetch("/api/km/relatorio-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analista_id: selectedId ?? undefined,
          analista_nome: selectedAnalista?.nome_completo ?? undefined,
          from: from || undefined,
          to: to || undefined,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (selectedAnalista?.nome_completo ?? "consolidado").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
      const periodo = [from || "inicio", to || "hoje"].join("_");
      a.download = `reembolsos_${slug}_${periodo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Reembolsos</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Controle de reembolsos por funcionário</p>
      </div>

      {/* Period filter */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>De</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Até</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} style={{ background: "none", border: "none", color: "#FFB800", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "10px 0" }}>
            Limpar filtro
          </button>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={handleGerarPdf}
            disabled={generatingPdf}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px", background: generatingPdf ? "#a38600" : "#FFD700", color: "#000",
              border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13,
              cursor: generatingPdf ? "not-allowed" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {generatingPdf ? "Gerando PDF..." : "Gerar PDF"}
          </button>
        </div>
      </div>

      {/* Analyst selector */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Funcionário</p>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
          {/* "Todos" card */}
          <button
            onClick={() => setSelectedId(null)}
            style={{
              flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center",
              gap: 6, padding: "12px 18px", borderRadius: 12, cursor: "pointer",
              border: selectedId === null ? "2px solid #FFD700" : "2px solid #E5E7EB",
              background: selectedId === null ? "#FFFDF0" : "#fff",
              minWidth: 90,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#111827", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFD700", fontSize: 16, fontWeight: 800 }}>
              {"∑"}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>Todos</span>
          </button>

          {analistas.map((a) => {
            const selected = selectedId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                style={{
                  flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 6, padding: "12px 18px", borderRadius: 12, cursor: "pointer",
                  border: selected ? "2px solid #FFD700" : "2px solid #E5E7EB",
                  background: selected ? "#FFFDF0" : "#fff",
                  minWidth: 90,
                }}
              >
                {a.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.avatar_url} alt={a.nome_completo} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: selected ? "2px solid #FFD700" : "2px solid #E5E7EB" }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: selected ? "#FFD700" : "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: selected ? "#000" : "#374151" }}>
                    {getInitials(a.nome_completo)}
                  </div>
                )}
                <span style={{ fontSize: 11, fontWeight: 600, color: "#111827", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.nome_completo.split(" ")[0]}
                </span>
                {a.cargo && (
                  <span style={{ fontSize: 10, color: "#9CA3AF", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.cargo}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { title: "Total KM", value: `${totalKm.toLocaleString("pt-BR")} km`, accent: "#FFD700" },
          { title: "Reembolso KM", value: formatCurrency(totalReembolso), accent: "#10B981" },
          { title: "Outros Custos", value: formatCurrency(totalOutrosCustos), accent: "#3B82F6" },
          { title: "Total Geral", value: formatCurrency(totalGeral), accent: "#FFD700" },
        ].map((card) => (
          <div key={card.title} className="card" style={{ position: "relative", overflow: "hidden", padding: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{card.title}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>{card.value}</p>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: card.accent, borderRadius: "0 0 12px 12px" }} />
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: "#9CA3AF", fontSize: 14, textAlign: "center", padding: 40 }}>Carregando registros...</p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFAFA" }}>
                <th style={thStyle}>Data</th>
                {!selectedId && <th style={thStyle}>Analista</th>}
                <th style={thStyle}>Tipo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>KM Inicial</th>
                <th style={{ ...thStyle, textAlign: "right" }}>KM Final</th>
                <th style={{ ...thStyle, textAlign: "right" }}>KM Rodados</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Reembolso KM</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Outros Custos</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={selectedId ? 8 : 9} style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
                    Nenhum registro encontrado no período.
                  </td>
                </tr>
              ) : (
                registros.map((r) => {
                  const tipoInfo = TIPOS_DESLOCAMENTO[r.tipo_servico ?? ""] ?? FALLBACK_TIPO;
                  const oc = ocSum(r.outros_custos);
                  const rowTotal = (r.valor_total ?? 0) + oc;
                  const isExpanded = expandedRow === r.id;
                  const analista = analistaMap.get(r.analista_id);
                  const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#374151" };

                  return (
                    <RegistroRow
                      key={r.id}
                      r={r}
                      tipoInfo={tipoInfo}
                      oc={oc}
                      rowTotal={rowTotal}
                      isExpanded={isExpanded}
                      visitas={rowVisitas[r.id]}
                      loadingVisitas={loadingVisitas === r.id}
                      onToggle={() => toggleExpand(r.id)}
                      showAnalista={!selectedId}
                      analistaNome={analista?.nome_completo ?? "—"}
                      colSpan={selectedId ? 8 : 9}
                    />
                  );
                })
              )}
            </tbody>
            {registros.length > 0 && (
              <tfoot>
                <tr style={{ background: "#F9FAFB", borderTop: "2px solid #E5E7EB" }}>
                  <td colSpan={selectedId ? 4 : 5} style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "#111827" }}>
                    Totais
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "#111827", textAlign: "right" }}>
                    {totalKm.toLocaleString("pt-BR")}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "#10B981", textAlign: "right" }}>
                    {formatCurrency(totalReembolso)}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "#3B82F6", textAlign: "right" }}>
                    {formatCurrency(totalOutrosCustos)}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 800, color: "#111827", textAlign: "right" }}>
                    {formatCurrency(totalGeral)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ── Row Component ────────────────────────────────────────────────────────────

function RegistroRow({
  r,
  tipoInfo,
  oc,
  rowTotal,
  isExpanded,
  visitas,
  loadingVisitas,
  onToggle,
  showAnalista,
  analistaNome,
  colSpan,
}: {
  r: KmRegistro;
  tipoInfo: { label: string; color: string; bg: string };
  oc: number;
  rowTotal: number;
  isExpanded: boolean;
  visitas: KmVisita[] | undefined;
  loadingVisitas: boolean;
  onToggle: () => void;
  showAnalista: boolean;
  analistaNome: string;
  colSpan: number;
}) {
  const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#374151" };

  return (
    <>
      <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #F3F4F6", cursor: "pointer" }} onClick={onToggle}>
        <td style={{ ...td, fontWeight: 600, color: "#111827" }}>
          <span style={{ marginRight: 6, fontSize: 10, color: "#9CA3AF" }}>{isExpanded ? "▼" : "▶"}</span>
          {formatDate(r.data)}
        </td>
        {showAnalista && (
          <td style={{ ...td, fontWeight: 600, color: "#111827" }}>{analistaNome}</td>
        )}
        <td style={td}>
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: tipoInfo.bg, color: tipoInfo.color }}>
            {tipoInfo.label}
          </span>
        </td>
        <td style={{ ...td, textAlign: "right" }}>{r.km_inicial.toLocaleString("pt-BR")}</td>
        <td style={{ ...td, textAlign: "right" }}>{r.km_final.toLocaleString("pt-BR")}</td>
        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#111827" }}>{r.km_rodados.toLocaleString("pt-BR")}</td>
        <td style={{ ...td, textAlign: "right" }}>{r.valor_total != null ? formatCurrency(r.valor_total) : "—"}</td>
        <td style={{ ...td, textAlign: "right" }}>{oc > 0 ? formatCurrency(oc) : "—"}</td>
        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#111827" }}>{formatCurrency(rowTotal)}</td>
      </tr>
      {isExpanded && (
        <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
          <td colSpan={colSpan} style={{ padding: "12px 24px 16px", background: "#FAFAFA" }}>
            {loadingVisitas ? (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Carregando visitas...</p>
            ) : visitas && visitas.length > 0 ? (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                  Visitas ({visitas.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {visitas.map((v, idx) => (
                    <div key={v.id} style={{ display: "flex", gap: 16, fontSize: 13, padding: "6px 0", borderBottom: idx < visitas.length - 1 ? "1px solid #E5E7EB" : "none" }}>
                      <span style={{ fontWeight: 600, color: "#111827", minWidth: 160 }}>{v.empresa}</span>
                      {v.contato && <span style={{ color: "#6B7280" }}>Contato: {v.contato}</span>}
                      {v.motivo && <span style={{ color: "#6B7280" }}>Motivo: {v.motivo}</span>}
                      {v.resultado && <span style={{ color: "#374151" }}>→ {v.resultado}</span>}
                    </div>
                  ))}
                </div>
                {r.outros_custos && r.outros_custos.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                      Outros custos ({r.outros_custos.length})
                    </p>
                    {r.outros_custos.map((c, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 16, fontSize: 13, padding: "4px 0" }}>
                        <span style={{ fontWeight: 600, color: "#111827" }}>{c.tipo}</span>
                        {c.descricao && <span style={{ color: "#6B7280" }}>{c.descricao}</span>}
                        <span style={{ color: "#111827", fontWeight: 700, marginLeft: "auto" }}>{formatCurrency(c.valor)}</span>
                        {c.comprovante_url && (
                          <a href={c.comprovante_url} target="_blank" rel="noopener noreferrer" style={{ color: "#3B82F6", fontSize: 12, fontWeight: 600 }}>
                            Ver comprovante
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Nenhuma visita registrada.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
