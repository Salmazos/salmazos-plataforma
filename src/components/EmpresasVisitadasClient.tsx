"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ROTULO_RESULTADO_CONTATO, rotuloEtapa } from "@/lib/comercialRotulos";

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
  qtd_contatos?: number;
  oportunidade_aberta?: OportunidadeAberta | null;
}

interface OportunidadeAberta { id: string; vendedor_nome: string | null; etapa: string }
interface Contato { id: string; nome: string; cargo: string | null; telefone: string | null; email: string | null; principal: boolean }

interface ItemHistorico {
  id: string;
  origem: "visita_km" | "funil" | "avulso" | "fase";
  data: string | null;
  analista_nome: string | null;
  contato_nome: string | null;
  tipo: string | null;
  resultado: string | null;
  descricao: string | null;
}

interface Detalhe { data: ItemHistorico[]; contatos: Contato[]; oportunidade_aberta: OportunidadeAberta | null; pode_escrever: boolean }

interface Props {
  analistas: Analista[]; // available for future analista filter
  podeEscrever: boolean;
}

const ROTULO_TIPO_CONTATO: Record<string, string> = {
  ligacao: "Ligação", visita: "Visita", email: "E-mail", whatsapp: "WhatsApp", anotacao: "Anotação",
  supervisao: "Supervisão", comercial: "Visita comercial",
};
function rotuloOrigem(i: ItemHistorico): string {
  if (i.origem === "visita_km") return i.tipo === "supervisao" ? "Supervisão" : "Visita (KM)";
  if (i.origem === "funil") return "Funil";
  if (i.origem === "avulso") return "Contato avulso";
  return "Fase";
}
function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const btnMini: React.CSSProperties = { padding: "4px 10px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: "pointer" };
const btnAcao: React.CSSProperties = { padding: "8px 14px", background: "#FFB800", color: "#111", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" };

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
  // Data pura (km_registros.data, "2026-09-23"): new Date() lê como meia-noite UTC, que em
  // Brasília ainda é o dia anterior — o histórico mostrava toda visita com um dia a menos.
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function EmpresasVisitadasClient({ analistas: _analistas, podeEscrever }: Props) {
  const [empresas, setEmpresas] = useState<EmpresaVisitada[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, Detalhe>>({});
  const [loadingHistorico, setLoadingHistorico] = useState<string | null>(null);
  const [erroContato, setErroContato] = useState("");
  const [formContato, setFormContato] = useState<null | { empresaId: string; contatoId: string | null; nome: string; cargo: string; telefone: string; email: string }>(null);
  const [registroDe, setRegistroDe] = useState<EmpresaVisitada | null>(null);

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

  const carregarDetalhe = useCallback(async (empresaId: string) => {
    setLoadingHistorico(empresaId);
    try {
      const res = await fetch(`/api/km/empresas-visitadas?empresa_id=${empresaId}`);
      const json = await res.json();
      setDetalhes((prev) => ({ ...prev, [empresaId]: { data: json.data ?? [], contatos: json.contatos ?? [], oportunidade_aberta: json.oportunidade_aberta ?? null, pode_escrever: json.pode_escrever === true } }));
    } catch { /* ignore */ } finally {
      setLoadingHistorico(null);
    }
  }, []);

  const toggleExpand = async (empresaId: string) => {
    if (expandedId === empresaId) { setExpandedId(null); return; }
    setExpandedId(empresaId);
    setErroContato(""); setFormContato(null);
    if (!detalhes[empresaId]) await carregarDetalhe(empresaId);
  };

  // Depois de qualquer escrita: recarrega a lista e o detalhe da empresa expandida.
  const recarregarTudo = async (empresaId: string) => {
    await Promise.all([loadEmpresas(), carregarDetalhe(empresaId)]);
  };

  async function chamar(url: string, method: string, body?: unknown): Promise<boolean> {
    setErroContato("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErroContato(json.error || "Não foi possível concluir a ação."); return false; }
    return true;
  }

  async function salvarContato() {
    if (!formContato) return;
    const { empresaId, contatoId, nome, cargo, telefone, email } = formContato;
    if (!nome.trim()) { setErroContato("Informe o nome do contato."); return; }
    const url = contatoId ? `/api/comercial/empresas/${empresaId}/contatos/${contatoId}` : `/api/comercial/empresas/${empresaId}/contatos`;
    if (await chamar(url, contatoId ? "PATCH" : "POST", { nome, cargo, telefone, email })) {
      setFormContato(null);
      await recarregarTudo(empresaId);
    }
  }
  async function definirPrincipal(empresaId: string, contatoId: string) {
    if (await chamar(`/api/comercial/empresas/${empresaId}/contatos/${contatoId}`, "PATCH", { principal: true })) await recarregarTudo(empresaId);
  }
  async function excluirContato(empresaId: string, c: Contato) {
    if (!window.confirm(`Excluir o contato ${c.nome}?`)) return;
    if (await chamar(`/api/comercial/empresas/${empresaId}/contatos/${c.id}`, "DELETE")) await recarregarTudo(empresaId);
  }

  // Client-side search filter
  const filtered = empresas.filter((e) =>
    !search || e.nome.toLowerCase().includes(search.toLowerCase())
  );

  const totalEmpresas = empresas.length;
  const totalContatos = empresas.reduce((s, e) => s + e.total_visitas, 0);
  const comCliente = empresas.filter((e) => e.cliente_id).length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Carteira de Clientes</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Base permanente de empresas prospectadas e visitadas</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { title: "Empresas Cadastradas", value: totalEmpresas, accent: "#FFD700" },
          { title: "Total de Contatos", value: totalContatos, accent: "#3B82F6" },
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
                <th style={{ ...thStyle, textAlign: "right" }}>Contatos</th>
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
                  const det = detalhes[e.id];
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
                          {e.oportunidade_aberta && (
                            <span style={{ marginLeft: 8, display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "#DBEAFE", color: "#1E40AF" }}>
                              Oportunidade aberta · {rotuloEtapa(e.oportunidade_aberta.etapa)}
                            </span>
                          )}
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
                            {loadingHistorico === e.id && !det ? (
                              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Carregando...</p>
                            ) : det ? (
                              <div>
                                {/* Ações */}
                                {podeEscrever && det.pode_escrever && (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
                                    <button style={btnAcao} onClick={() => setRegistroDe(e)}>Registrar contato</button>
                                    {det.oportunidade_aberta ? (
                                      <button disabled style={{ ...btnMini, padding: "8px 14px", fontSize: 13, opacity: 0.7, cursor: "not-allowed" }}>
                                        Já existe oportunidade aberta ({det.oportunidade_aberta.vendedor_nome ?? "—"} · {rotuloEtapa(det.oportunidade_aberta.etapa)})
                                      </button>
                                    ) : (
                                      <button style={{ ...btnMini, padding: "8px 14px", fontSize: 13 }} onClick={() => { window.location.href = `/painel/comercial?empresa=${e.id}`; }}>Criar oportunidade</button>
                                    )}
                                  </div>
                                )}

                                {/* Contatos da empresa */}
                                <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                                  Contatos da empresa ({det.contatos.length})
                                </p>
                                {erroContato && <div style={{ color: "#B91C1C", fontSize: 13, marginBottom: 8 }}>{erroContato}</div>}
                                {det.contatos.length === 0 ? (
                                  <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 8px" }}>Nenhum contato cadastrado.</p>
                                ) : det.contatos.map((c) => (
                                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid #F3F4F6", fontSize: 13 }}>
                                    <div>
                                      <span style={{ fontWeight: 700, color: "#111827" }}>{c.nome}</span>
                                      {c.principal && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E" }}>Principal</span>}
                                      <span style={{ color: "#6B7280" }}>{c.cargo ? ` · ${c.cargo}` : ""}{c.telefone ? ` · ${c.telefone}` : ""}{c.email ? ` · ${c.email}` : ""}</span>
                                    </div>
                                    {podeEscrever && det.pode_escrever && (
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button style={btnMini} onClick={() => { setErroContato(""); setFormContato({ empresaId: e.id, contatoId: c.id, nome: c.nome, cargo: c.cargo ?? "", telefone: c.telefone ?? "", email: c.email ?? "" }); }}>Editar</button>
                                        {!c.principal && <button style={btnMini} onClick={() => definirPrincipal(e.id, c.id)}>Definir como principal</button>}
                                        <button style={{ ...btnMini, color: "#B91C1C" }} onClick={() => excluirContato(e.id, c)}>Excluir</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {podeEscrever && det.pode_escrever && !formContato && (
                                  <button style={{ ...btnMini, marginTop: 8 }} onClick={() => { setErroContato(""); setFormContato({ empresaId: e.id, contatoId: null, nome: "", cargo: "", telefone: "", email: "" }); }}>Novo contato</button>
                                )}
                                {formContato && formContato.empresaId === e.id && (
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10, alignItems: "end" }}>
                                    <div><label style={labelStyle}>Nome *</label><input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", padding: "7px 10px" }} value={formContato.nome} onChange={(x) => setFormContato({ ...formContato, nome: x.target.value })} /></div>
                                    <div><label style={labelStyle}>Cargo</label><input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", padding: "7px 10px" }} value={formContato.cargo} onChange={(x) => setFormContato({ ...formContato, cargo: x.target.value })} /></div>
                                    <div><label style={labelStyle}>Telefone</label><input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", padding: "7px 10px" }} value={formContato.telefone} onChange={(x) => setFormContato({ ...formContato, telefone: x.target.value })} /></div>
                                    <div><label style={labelStyle}>E-mail</label><input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", padding: "7px 10px" }} value={formContato.email} onChange={(x) => setFormContato({ ...formContato, email: x.target.value })} /></div>
                                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                                      <button style={btnAcao} onClick={salvarContato}>Salvar contato</button>
                                      <button style={btnMini} onClick={() => setFormContato(null)}>Cancelar</button>
                                    </div>
                                  </div>
                                )}

                                {/* Histórico unificado */}
                                <p style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "18px 0 10px" }}>
                                  Histórico ({det.data.length})
                                </p>
                                {det.data.length === 0 ? (
                                  <p style={{ fontSize: 13, color: "#9CA3AF" }}>Nenhum histórico disponível.</p>
                                ) : (
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr>
                                        {["Data", "Origem", "Responsável", "Contato", "Resultado/Tipo", "Resumo"].map((h) => (
                                          <th key={h} style={{ padding: "4px 8px", fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {det.data.map((v) => (
                                        <tr key={v.id} style={{ borderBottom: "1px solid #F9FAFB" }}>
                                          <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{formatDate(v.data)}</td>
                                          <td style={{ padding: "6px 8px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>{rotuloOrigem(v)}</td>
                                          <td style={{ padding: "6px 8px", fontSize: 12, color: "#374151" }}>{v.analista_nome ?? "—"}</td>
                                          <td style={{ padding: "6px 8px", fontSize: 12, color: "#374151" }}>{v.contato_nome ?? "—"}</td>
                                          <td style={{ padding: "6px 8px", fontSize: 12, color: "#6B7280" }}>
                                            {[v.tipo ? (ROTULO_TIPO_CONTATO[v.tipo] ?? v.tipo) : null, v.resultado ? (ROTULO_RESULTADO_CONTATO[v.resultado] ?? v.resultado) : null].filter(Boolean).join(" · ") || "—"}
                                          </td>
                                          <td style={{ padding: "6px 8px", fontSize: 12, color: "#374151" }}>{v.descricao ?? "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
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

      {registroDe && (
        <ModalRegistro
          empresa={registroDe}
          contatos={detalhes[registroDe.id]?.contatos ?? []}
          onClose={() => setRegistroDe(null)}
          onSalvo={async () => { const id = registroDe.id; setRegistroDe(null); await recarregarTudo(id); }}
        />
      )}
    </div>
  );
}

function ModalRegistro({ empresa, contatos, onClose, onSalvo }: { empresa: EmpresaVisitada; contatos: Contato[]; onClose: () => void; onSalvo: () => void }) {
  const hoje = hojeSP();
  const [contatoSel, setContatoSel] = useState((contatos.find((c) => c.principal) ?? contatos[0])?.id ?? "novo");
  const [novo, setNovo] = useState({ nome: "", cargo: "", telefone: "", email: "" });
  const [f, setF] = useState({ tipo: "ligacao", resultado: "", descricao: "", ocorrido_em: hoje, proximo_contato_em: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const campo: React.CSSProperties = { ...inputStyle, width: "100%", boxSizing: "border-box", padding: "8px 12px" };

  async function salvar() {
    setSalvando(true); setErro("");
    let contatoId: string | null = contatoSel !== "novo" ? contatoSel : null;
    if (contatoSel === "novo" && novo.nome.trim()) {
      const rc = await fetch(`/api/comercial/empresas/${empresa.id}/contatos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novo) });
      const jc = await rc.json();
      if (!rc.ok) { setSalvando(false); setErro(jc.error || "Erro ao salvar o contato."); return; }
      contatoId = jc.data.id;
    }
    const r = await fetch(`/api/comercial/empresas/${empresa.id}/registros`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contato_id: contatoId, tipo: f.tipo, resultado: f.resultado || null, descricao: f.descricao || null,
        ocorrido_em: f.ocorrido_em || undefined, proximo_contato_em: f.proximo_contato_em || undefined,
      }),
    });
    const j = await r.json();
    setSalvando(false);
    if (!r.ok) { setErro(j.error || "Erro ao salvar."); return; }
    onSalvo();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={(x) => x.stopPropagation()}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800, color: "#111827" }}>Registrar contato · {empresa.nome}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={labelStyle}>Contato</label>
            <select style={campo} value={contatoSel} onChange={(x) => setContatoSel(x.target.value)}>
              {contatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ""}{c.principal ? " (principal)" : ""}</option>)}
              <option value="novo">Novo contato</option>
            </select>
            {contatoSel === "novo" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <div><label style={labelStyle}>Nome *</label><input style={campo} value={novo.nome} onChange={(x) => setNovo({ ...novo, nome: x.target.value })} /></div>
                <div><label style={labelStyle}>Cargo</label><input style={campo} value={novo.cargo} onChange={(x) => setNovo({ ...novo, cargo: x.target.value })} /></div>
                <div><label style={labelStyle}>Telefone</label><input style={campo} value={novo.telefone} onChange={(x) => setNovo({ ...novo, telefone: x.target.value })} /></div>
                <div><label style={labelStyle}>E-mail</label><input style={campo} value={novo.email} onChange={(x) => setNovo({ ...novo, email: x.target.value })} /></div>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Tipo</label>
              <select style={campo} value={f.tipo} onChange={(x) => setF({ ...f, tipo: x.target.value })}>
                {["ligacao", "visita", "email", "whatsapp", "anotacao"].map((k) => <option key={k} value={k}>{ROTULO_TIPO_CONTATO[k]}</option>)}
              </select></div>
            <div><label style={labelStyle}>Resultado</label>
              <select style={campo} value={f.resultado} onChange={(x) => setF({ ...f, resultado: x.target.value })}>
                <option value="">—</option>
                {Object.entries(ROTULO_RESULTADO_CONTATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
          </div>
          <div><label style={labelStyle}>O que foi conversado</label><textarea style={{ ...campo, minHeight: 60, resize: "vertical" }} value={f.descricao} onChange={(x) => setF({ ...f, descricao: x.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Data do contato</label><input type="date" style={campo} max={hoje} value={f.ocorrido_em} onChange={(x) => setF({ ...f, ocorrido_em: x.target.value })} /></div>
            <div><label style={labelStyle}>Quando vamos retornar?</label><input type="date" style={campo} min={hoje} value={f.proximo_contato_em} onChange={(x) => setF({ ...f, proximo_contato_em: x.target.value })} /></div>
          </div>
          {erro && <div style={{ color: "#B91C1C", fontSize: 13 }}>{erro}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={btnMini} onClick={onClose}>Cancelar</button>
            <button style={btnAcao} disabled={salvando} onClick={salvar}>{salvando ? "Salvando..." : "Salvar contato"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
