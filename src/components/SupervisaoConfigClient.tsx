"use client";

import { useCallback, useEffect, useState } from "react";

interface Cliente { id: string; nome: string; ativo: boolean }
interface Supervisor { id: string; nome_completo: string }
interface MetaRow {
  id: string;
  cliente_id: string;
  frequencia_dias: number;
  supervisor_responsavel_id: string | null;
  modo: "padrao" | "implantacao";
  data_fim_implantacao: string | null;
  clientes: { id: string; nome: string; ativo: boolean } | null;
  analistas_perfil: { id: string; nome_completo: string } | null;
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1px solid #D1D5DB",
  borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", boxSizing: "border-box",
};
const thStyle: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, color: "#FFB800", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "2px solid #F3F4F6", whiteSpace: "nowrap", textAlign: "left",
};
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#374151" };

interface FormState {
  cliente_id: string;
  frequencia_dias: string;
  supervisor_responsavel_id: string;
  modo: "padrao" | "implantacao";
  data_fim_implantacao: string;
}

function novoForm(): FormState {
  return { cliente_id: "", frequencia_dias: "7", supervisor_responsavel_id: "", modo: "padrao", data_fim_implantacao: "" };
}

export default function SupervisaoConfigClient() {
  const [metas, setMetas] = useState<MetaRow[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(novoForm());
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supervisao-config");
      const json = await res.json();
      setMetas(json.data ?? []);
      setClientes(json.clientes ?? []);
      setSupervisores(json.supervisores ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  const clientesDisponiveis = clientes.filter((c) => !metas.some((m) => m.cliente_id === c.id));

  const openNew = () => {
    setEditingId(null);
    setForm(novoForm());
    setModalOpen(true);
  };

  const openEdit = (m: MetaRow) => {
    setEditingId(m.id);
    setForm({
      cliente_id: m.cliente_id,
      frequencia_dias: String(m.frequencia_dias),
      supervisor_responsavel_id: m.supervisor_responsavel_id ?? "",
      modo: m.modo,
      data_fim_implantacao: m.data_fim_implantacao ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!editingId && !form.cliente_id) { setToast("Selecione um cliente."); return; }
    if (form.modo === "implantacao" && !form.data_fim_implantacao) { setToast("Informe a data de fim de implantação."); return; }
    setSubmitting(true);
    try {
      const body = {
        ...(!editingId ? { cliente_id: form.cliente_id } : {}),
        frequencia_dias: Number(form.frequencia_dias) || 7,
        supervisor_responsavel_id: form.supervisor_responsavel_id || null,
        modo: form.modo,
        data_fim_implantacao: form.modo === "implantacao" ? form.data_fim_implantacao : null,
      };
      const url = editingId ? `/api/supervisao-config/${editingId}` : "/api/supervisao-config";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const json = await res.json(); setToast(json.error ?? "Erro ao salvar."); return; }
      setToast(editingId ? "Configuração atualizada!" : "Cliente adicionado ao programa!");
      setModalOpen(false);
      loadData();
    } catch {
      setToast("Erro de conexão.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (m: MetaRow) => {
    if (!confirm(`Remover "${m.clientes?.nome}" do programa de supervisão?`)) return;
    try {
      const res = await fetch(`/api/supervisao-config/${m.id}`, { method: "DELETE" });
      if (res.ok) { setToast("Removido do programa de supervisão."); loadData(); }
    } catch { /* ignore */ }
  };

  if (loading) return <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando configuração...</p>;

  return (
    <div>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, maxWidth: 420, background: "#059669", color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew} style={{ padding: "10px 18px", background: "#FFD700", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Adicionar Cliente
        </button>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#FAFAFA" }}>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Frequência</th>
              <th style={thStyle}>Supervisor Responsável</th>
              <th style={thStyle}>Modo</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {metas.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "48px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Nenhum cliente configurado no programa de supervisão.</td></tr>
            ) : (
              metas.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>{m.clientes?.nome ?? "—"}</td>
                  <td style={tdStyle}>a cada {m.frequencia_dias} dias</td>
                  <td style={tdStyle}>{m.analistas_perfil?.nome_completo ?? "—"}</td>
                  <td style={tdStyle}>
                    {m.modo === "implantacao" ? (
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#DBEAFE", color: "#1E40AF" }}>
                        Implantação até {m.data_fim_implantacao?.split("-").reverse().join("/")}
                      </span>
                    ) : "Padrão"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      <button onClick={() => openEdit(m)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                        Editar
                      </button>
                      <button onClick={() => handleDelete(m)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", fontSize: 11, fontWeight: 600, color: "#DC2626", cursor: "pointer" }}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setModalOpen(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 460, maxWidth: "95vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 20px" }}>
              {editingId ? "Editar Configuração" : "Adicionar Cliente ao Programa"}
            </h2>

            {!editingId && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Cliente *</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={form.cliente_id} onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {clientesDisponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Frequência de supervisão (dias)</label>
              <input type="number" min={1} style={inputStyle} value={form.frequencia_dias} onChange={(e) => setForm((f) => ({ ...f, frequencia_dias: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Supervisor responsável</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.supervisor_responsavel_id} onChange={(e) => setForm((f) => ({ ...f, supervisor_responsavel_id: e.target.value }))}>
                <option value="">Nenhum</option>
                {supervisores.map((s) => <option key={s.id} value={s.id}>{s.nome_completo}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Modo</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.modo} onChange={(e) => setForm((f) => ({ ...f, modo: e.target.value as "padrao" | "implantacao" }))}>
                <option value="padrao">Padrão</option>
                <option value="implantacao">Em implantação</option>
              </select>
            </div>

            {form.modo === "implantacao" && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Data de fim da implantação *</label>
                <input type="date" style={inputStyle} value={form.data_fim_implantacao} onChange={(e) => setForm((f) => ({ ...f, data_fim_implantacao: e.target.value }))} />
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.5 : 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: submitting ? "#a38600" : "#FFD700", color: "#000", fontSize: 13, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}
              >
                {submitting ? "Salvando..." : editingId ? "Salvar Alterações" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
