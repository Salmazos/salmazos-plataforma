"use client";

import { useState, useEffect, useCallback } from "react";

interface KmConfig {
  id?: string;
  analista_id: string;
  tipo_servico: string;
  valor_por_km: number;
}

interface KmRegistro {
  id: string;
  analista_id: string;
  data: string;
  km_inicial: number;
  km_final: number;
  km_rodados: number;
  destino: string | null;
  cliente_visitado: string | null;
  motivo: string | null;
  resultado: string | null;
  tipo_servico: string | null;
  valor_por_km: number | null;
  valor_total: number | null;
}

interface Props {
  analistaId: string;
  isGestor: boolean;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
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

function formatCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string): string {
  return d.split("-").reverse().join("/");
}

export default function KmTab({ analistaId, isGestor }: Props) {
  const [configs, setConfigs] = useState<KmConfig[]>([]);
  const [registros, setRegistros] = useState<KmRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [configOperacional, setConfigOperacional] = useState("");
  const [configComercial, setConfigComercial] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    data: new Date().toISOString().split("T")[0],
    tipo_servico: "operacional",
    km_inicial: "",
    km_final: "",
    destino: "",
    cliente_visitado: "",
    motivo: "",
    resultado: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, regRes] = await Promise.all([
        fetch(`/api/km/config?analista_id=${analistaId}`),
        fetch(`/api/km/registros?analista_id=${analistaId}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
      ]);
      const cfgJson = await cfgRes.json();
      const regJson = await regRes.json();
      const cfgs = cfgJson.data ?? [];
      setConfigs(cfgs);
      setRegistros(regJson.data ?? []);
      const opCfg = cfgs.find((c: KmConfig) => c.tipo_servico === "operacional");
      const comCfg = cfgs.find((c: KmConfig) => c.tipo_servico === "comercial");
      setConfigOperacional(opCfg?.valor_por_km?.toString() ?? "");
      setConfigComercial(comCfg?.valor_por_km?.toString() ?? "");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [analistaId, from, to]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const saveConfig = async (tipo: string, valor: string) => {
    if (!valor.trim()) return;
    setSavingConfig(true);
    try {
      const res = await fetch("/api/km/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analista_id: analistaId, tipo_servico: tipo, valor_por_km: parseFloat(valor) }),
      });
      if (res.ok) {
        setToast("Configuração salva!");
        loadData();
      }
    } catch { /* ignore */ } finally {
      setSavingConfig(false);
    }
  };

  const getValorPorKm = (tipo: string): number => {
    const cfg = configs.find((c) => c.tipo_servico === tipo);
    return cfg?.valor_por_km ?? 0;
  };

  const kmRodados = formData.km_inicial && formData.km_final
    ? Math.max(0, Number(formData.km_final) - Number(formData.km_inicial))
    : 0;
  const valorKm = getValorPorKm(formData.tipo_servico);
  const valorTotal = kmRodados * valorKm;

  const openNewModal = () => {
    setEditingId(null);
    setFormData({
      data: new Date().toISOString().split("T")[0],
      tipo_servico: "operacional",
      km_inicial: "",
      km_final: "",
      destino: "",
      cliente_visitado: "",
      motivo: "",
      resultado: "",
    });
    setModalOpen(true);
  };

  const openEditModal = (r: KmRegistro) => {
    setEditingId(r.id);
    setFormData({
      data: r.data,
      tipo_servico: r.tipo_servico ?? "operacional",
      km_inicial: r.km_inicial.toString(),
      km_final: r.km_final.toString(),
      destino: r.destino ?? "",
      cliente_visitado: r.cliente_visitado ?? "",
      motivo: r.motivo ?? "",
      resultado: r.resultado ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.data || !formData.km_inicial || !formData.km_final) {
      setToast("Preencha data, KM inicial e KM final.");
      return;
    }
    if (Number(formData.km_final) < Number(formData.km_inicial)) {
      setToast("KM final deve ser maior que KM inicial.");
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId ? `/api/km/registros/${editingId}` : "/api/km/registros";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { ...formData, km_inicial: Number(formData.km_inicial), km_final: Number(formData.km_final), valor_por_km: valorKm }
        : { analista_id: analistaId, ...formData, km_inicial: Number(formData.km_inicial), km_final: Number(formData.km_final), valor_por_km: valorKm };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast(editingId ? "Registro atualizado!" : "Registro criado!");
        setModalOpen(false);
        loadData();
      } else {
        const json = await res.json();
        setToast(json.error ?? "Erro ao salvar.");
      }
    } catch {
      setToast("Erro de conexão.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro de KM?")) return;
    try {
      const res = await fetch(`/api/km/registros/${id}`, { method: "DELETE" });
      if (res.ok) {
        setToast("Registro excluído!");
        loadData();
      }
    } catch { /* ignore */ }
  };

  const totalKm = registros.reduce((sum, r) => sum + r.km_rodados, 0);
  const totalReembolso = registros.reduce((sum, r) => sum + (r.valor_total ?? 0), 0);

  if (loading) return <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando dados de quilometragem...</p>;

  return (
    <div>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: "#059669", color: "#fff", padding: "12px 20px",
          borderRadius: 10, fontSize: 14, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}>
          {toast}
        </div>
      )}

      {/* Config Section */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
          Valor por KM
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 500 }}>
          <div>
            <label style={labelStyle}>Operacional (R$/km)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                step="0.01"
                style={{ ...inputStyle, background: isGestor ? "#fff" : "#F3F4F6" }}
                value={configOperacional}
                onChange={(e) => isGestor && setConfigOperacional(e.target.value)}
                readOnly={!isGestor}
                placeholder="0.00"
              />
              {isGestor && (
                <button
                  onClick={() => saveConfig("operacional", configOperacional)}
                  disabled={savingConfig}
                  style={{
                    padding: "8px 14px", background: "#FFD700", color: "#000",
                    border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12,
                    cursor: savingConfig ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Salvar
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Comercial (R$/km)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                step="0.01"
                style={{ ...inputStyle, background: isGestor ? "#fff" : "#F3F4F6" }}
                value={configComercial}
                onChange={(e) => isGestor && setConfigComercial(e.target.value)}
                readOnly={!isGestor}
                placeholder="0.00"
              />
              {isGestor && (
                <button
                  onClick={() => saveConfig("comercial", configComercial)}
                  disabled={savingConfig}
                  style={{
                    padding: "8px 14px", background: "#FFD700", color: "#000",
                    border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12,
                    cursor: savingConfig ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Salvar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, maxWidth: 500 }}>
        <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
            Total KM no período
          </p>
          <p style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>
            {totalKm.toLocaleString("pt-BR")} km
          </p>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "#FFD700", borderRadius: "0 0 12px 12px" }} />
        </div>
        <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
            Total a Reembolsar
          </p>
          <p style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1 }}>
            {formatCurrency(totalReembolso)}
          </p>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "#10B981", borderRadius: "0 0 12px 12px" }} />
        </div>
      </div>

      {/* Filter + Actions Bar */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>De</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Até</label>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button
            onClick={() => { setFrom(""); setTo(""); }}
            style={{ background: "none", border: "none", color: "#FFB800", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "10px 0" }}
          >
            Limpar filtro
          </button>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={openNewModal}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px", background: "#FFD700", color: "#000",
              border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13,
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Registro
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#FAFAFA" }}>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Destino</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Tipo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>KM Inicial</th>
              <th style={{ ...thStyle, textAlign: "right" }}>KM Final</th>
              <th style={{ ...thStyle, textAlign: "right" }}>KM Rodados</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Valor/KM</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
                  Nenhum registro de quilometragem encontrado.
                </td>
              </tr>
            ) : (
              registros.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#111827", fontWeight: 600 }}>{formatDate(r.data)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151" }}>{r.destino ?? "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151" }}>{r.cliente_visitado ?? "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 6,
                      fontSize: 11, fontWeight: 700,
                      background: r.tipo_servico === "comercial" ? "#DBEAFE" : "#F3F4F6",
                      color: r.tipo_servico === "comercial" ? "#1E40AF" : "#374151",
                    }}>
                      {r.tipo_servico ?? "—"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", textAlign: "right" }}>{r.km_inicial.toLocaleString("pt-BR")}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", textAlign: "right" }}>{r.km_final.toLocaleString("pt-BR")}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#111827", fontWeight: 700, textAlign: "right" }}>{r.km_rodados.toLocaleString("pt-BR")}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", textAlign: "right" }}>{r.valor_por_km != null ? formatCurrency(r.valor_por_km) : "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#111827", fontWeight: 700, textAlign: "right" }}>{r.valor_total != null ? formatCurrency(r.valor_total) : "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      <button
                        onClick={() => openEditModal(r)}
                        style={{
                          padding: "4px 10px", borderRadius: 6,
                          border: "1px solid #D1D5DB", background: "#fff",
                          fontSize: 11, fontWeight: 600, color: "#374151",
                          cursor: "pointer",
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        style={{
                          padding: "4px 10px", borderRadius: 6,
                          border: "1px solid #FCA5A5", background: "#FEF2F2",
                          fontSize: 11, fontWeight: 600, color: "#DC2626",
                          cursor: "pointer",
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setModalOpen(false); }}
        >
          <div style={{
            background: "#fff", borderRadius: 12, padding: "24px 28px",
            width: 540, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>
              {editingId ? "Editar Registro de KM" : "Novo Registro de KM"}
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Data *</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={formData.data}
                  onChange={(e) => setFormData((f) => ({ ...f, data: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Tipo de serviço *</label>
                <select
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={formData.tipo_servico}
                  onChange={(e) => setFormData((f) => ({ ...f, tipo_servico: e.target.value }))}
                >
                  <option value="operacional">Operacional</option>
                  <option value="comercial">Comercial</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>KM Inicial *</label>
                <input
                  type="number"
                  style={inputStyle}
                  placeholder="Ex: 45230"
                  value={formData.km_inicial}
                  onChange={(e) => setFormData((f) => ({ ...f, km_inicial: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>KM Final *</label>
                <input
                  type="number"
                  style={inputStyle}
                  placeholder="Ex: 45280"
                  value={formData.km_final}
                  onChange={(e) => setFormData((f) => ({ ...f, km_final: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Destino</label>
                <input
                  style={inputStyle}
                  placeholder="Ex: São Paulo - Campinas"
                  value={formData.destino}
                  onChange={(e) => setFormData((f) => ({ ...f, destino: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Cliente visitado</label>
                <input
                  style={inputStyle}
                  placeholder="Nome do cliente"
                  value={formData.cliente_visitado}
                  onChange={(e) => setFormData((f) => ({ ...f, cliente_visitado: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Motivo</label>
                <input
                  style={inputStyle}
                  placeholder="Ex: Visita comercial"
                  value={formData.motivo}
                  onChange={(e) => setFormData((f) => ({ ...f, motivo: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Resultado</label>
                <input
                  style={inputStyle}
                  placeholder="Resultado da visita..."
                  value={formData.resultado}
                  onChange={(e) => setFormData((f) => ({ ...f, resultado: e.target.value }))}
                />
              </div>
            </div>

            {/* Live preview */}
            <div style={{
              marginTop: 20, padding: "14px 16px",
              background: "#111827", borderRadius: 10,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  KM Rodados
                </span>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#FFD700", margin: "4px 0 0" }}>
                  {kmRodados.toLocaleString("pt-BR")} km
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Valor Total
                </span>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#10B981", margin: "4px 0 0" }}>
                  {formatCurrency(valorTotal)}
                </p>
                <span style={{ fontSize: 11, color: "#6B7280" }}>
                  ({formatCurrency(valorKm)}/km)
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                style={{
                  padding: "10px 20px", borderRadius: 8,
                  border: "1px solid #E5E7EB", background: "#fff",
                  color: "#374151", fontSize: 13, fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: "10px 24px", borderRadius: 8,
                  border: "none", background: submitting ? "#a38600" : "#FFD700",
                  color: "#000", fontSize: 13, fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Salvando..." : editingId ? "Salvar Alterações" : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
