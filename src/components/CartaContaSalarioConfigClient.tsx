"use client";

import { useEffect, useState } from "react";

interface Analista {
  user_id: string;
  nome_completo: string;
  assinatura_url: string | null;
}

interface BancoParceiro {
  id: string;
  nome: string;
  emails_para: string[];
  emails_cc: string[];
  ativo: boolean;
}

interface Props {
  analistas: Analista[];
}

type Status = "idle" | "saving" | "ok" | "error";

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

function StatusBadge({ status, erro }: { status: Status; erro?: string }) {
  if (status === "idle") return null;
  if (status === "saving") return <span style={{ fontSize: 12, color: "#9CA3AF" }}>Salvando…</span>;
  if (status === "ok") return <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>✓ Salvo</span>;
  return (
    <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }} title={erro}>
      Erro
    </span>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: "none",
        background: checked ? "#534AB7" : "#D1D5DB",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16,
          borderRadius: "50%", background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }}
      />
    </button>
  );
}

export default function CartaContaSalarioConfigClient({ analistas }: Props) {
  const [loading, setLoading] = useState(true);
  const [erroGlobal, setErroGlobal] = useState("");

  // ── Bancos parceiros ──
  const [bancos, setBancos] = useState<BancoParceiro[]>([]);
  const [loadingBancos, setLoadingBancos] = useState(true);
  const [erroBancos, setErroBancos] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formNome, setFormNome] = useState("");
  const [formPara, setFormPara] = useState("");
  const [formCc, setFormCc] = useState("");
  const [salvandoForm, setSalvandoForm] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [statusToggle, setStatusToggle] = useState<Record<string, Status>>({});
  const [statusExcluir, setStatusExcluir] = useState<Record<string, Status>>({});
  const [erroExcluir, setErroExcluir] = useState<Record<string, string>>({});

  // ── Responsável RH ──
  const [responsavelId, setResponsavelId] = useState("");
  const [statusResp, setStatusResp] = useState<Status>("idle");
  const [erroResp, setErroResp] = useState("");

  const carregarBancos = () => {
    setLoadingBancos(true);
    fetch("/api/configuracoes/bancos-parceiros")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setErroBancos(json.error); return; }
        setBancos(json.data ?? []);
      })
      .catch(() => setErroBancos("Erro ao carregar bancos parceiros."))
      .finally(() => setLoadingBancos(false));
  };

  useEffect(() => {
    carregarBancos();
    fetch("/api/configuracoes/carta-conta-salario")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setErroGlobal(json.error); return; }
        setResponsavelId(json.responsavel_rh_user_id ?? "");
      })
      .catch(() => setErroGlobal("Erro ao carregar configuração."))
      .finally(() => setLoading(false));
  }, []);

  const abrirFormNovo = () => {
    setEditandoId(null);
    setFormNome("");
    setFormPara("");
    setFormCc("");
    setErroForm("");
    setFormAberto(true);
  };

  const abrirFormEditar = (banco: BancoParceiro) => {
    setEditandoId(banco.id);
    setFormNome(banco.nome);
    setFormPara(banco.emails_para.join(", "));
    setFormCc(banco.emails_cc.join(", "));
    setErroForm("");
    setFormAberto(true);
  };

  const salvarForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoForm(true);
    setErroForm("");
    try {
      const url = editandoId ? `/api/configuracoes/bancos-parceiros/${editandoId}` : "/api/configuracoes/bancos-parceiros";
      const res = await fetch(url, {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: formNome, para: formPara, cc: formCc }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setFormAberto(false);
      carregarBancos();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvandoForm(false);
    }
  };

  const alternarAtivo = async (banco: BancoParceiro) => {
    setStatusToggle((s) => ({ ...s, [banco.id]: "saving" }));
    try {
      const res = await fetch(`/api/configuracoes/bancos-parceiros/${banco.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !banco.ativo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setBancos((prev) => prev.map((b) => (b.id === banco.id ? { ...b, ativo: !banco.ativo } : b)));
      setStatusToggle((s) => ({ ...s, [banco.id]: "idle" }));
    } catch {
      setStatusToggle((s) => ({ ...s, [banco.id]: "error" }));
    }
  };

  const excluirBanco = async (banco: BancoParceiro) => {
    if (!confirm(`Excluir definitivamente "${banco.nome}"? Isso só é possível se ele nunca foi usado em nenhuma carta enviada.`)) return;
    setStatusExcluir((s) => ({ ...s, [banco.id]: "saving" }));
    setErroExcluir((e) => ({ ...e, [banco.id]: "" }));
    try {
      const res = await fetch(`/api/configuracoes/bancos-parceiros/${banco.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setBancos((prev) => prev.filter((b) => b.id !== banco.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroExcluir((e) => ({ ...e, [banco.id]: msg }));
      setStatusExcluir((s) => ({ ...s, [banco.id]: "error" }));
    }
  };

  const salvarResponsavel = async () => {
    setStatusResp("saving");
    setErroResp("");
    try {
      const res = await fetch("/api/configuracoes/carta-conta-salario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel_rh_user_id: responsavelId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setStatusResp("ok");
      setTimeout(() => setStatusResp("idle"), 2500);
    } catch (err) {
      setErroResp(err instanceof Error ? err.message : String(err));
      setStatusResp("error");
    }
  };

  const responsavelSelecionado = analistas.find((a) => a.user_id === responsavelId);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#9CA3AF", padding: "40px 0" }}>
        Carregando…
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
          Carta de Abertura de Conta
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4, marginBottom: 0 }}>
          Bancos parceiros e responsável pela assinatura na carta enviada ao banco
        </p>
      </div>

      {erroGlobal && (
        <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "12px 16px", borderRadius: 8, fontSize: 14, marginBottom: 20 }}>
          {erroGlobal}
        </div>
      )}

      {/* ── Bloco 1: Bancos parceiros ── */}
      <div className="card" style={{ marginBottom: 28 }}>
        <p className="section-title" style={{ marginBottom: 4 }}>Bancos parceiros</p>
        <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 0, marginBottom: 20 }}>
          Destinatários padrão por banco — pré-preenchem o modal da carta e continuam editáveis na hora do envio
        </p>

        {erroBancos ? (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "12px 16px", borderRadius: 8, fontSize: 14 }}>
            {erroBancos}
          </div>
        ) : loadingBancos ? (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Carregando…</p>
        ) : (
          <>
            {bancos.length === 0 ? (
              <p style={{ fontSize: 14, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>
                Nenhum banco parceiro cadastrado
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Nome</th>
                      <th style={thStyle}>Para</th>
                      <th style={thStyle}>Cc</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 90 }}>Ativo</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 160 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bancos.map((banco) => (
                      <tr key={banco.id} style={{ borderBottom: "1px solid #F9FAFB" }}>
                        <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 600, color: "#111827" }}>{banco.nome}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#6B7280", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={banco.emails_para.join(", ")}>
                          {banco.emails_para.join(", ") || "—"}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#6B7280", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={banco.emails_cc.join(", ")}>
                          {banco.emails_cc.join(", ") || "—"}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "center" }}>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <Toggle checked={banco.ativo} onChange={() => alternarAtivo(banco)} disabled={statusToggle[banco.id] === "saving"} />
                          </div>
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => abrirFormEditar(banco)}
                              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => excluirBanco(banco)}
                              disabled={statusExcluir[banco.id] === "saving"}
                              title={erroExcluir[banco.id]}
                              style={{
                                padding: "5px 12px", borderRadius: 7, border: "1px solid #FCA5A5", background: "#fff",
                                color: "#DC2626", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                                cursor: statusExcluir[banco.id] === "saving" ? "not-allowed" : "pointer",
                                opacity: statusExcluir[banco.id] === "saving" ? 0.5 : 1,
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                          {erroExcluir[banco.id] && (
                            <p style={{ fontSize: 11, color: "#DC2626", margin: "4px 0 0", textAlign: "right", maxWidth: 220 }}>
                              {erroExcluir[banco.id]}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {formAberto ? (
              <form
                onSubmit={salvarForm}
                style={{ borderTop: bancos.length > 0 ? "1px solid #F3F4F6" : "none", paddingTop: bancos.length > 0 ? 20 : 0 }}
              >
                <p style={{ ...labelStyle, marginBottom: 12 }}>{editandoId ? "Editar banco parceiro" : "Adicionar banco parceiro"}</p>
                <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Nome do banco</label>
                    <input value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Ex: Sicoob" className="input-field" required />
                  </div>
                  <div>
                    <label style={labelStyle}>Para</label>
                    <input value={formPara} onChange={(e) => setFormPara(e.target.value)} placeholder="email1@banco.com.br, email2@banco.com.br" className="input-field" required />
                  </div>
                  <div>
                    <label style={labelStyle}>Cc</label>
                    <input value={formCc} onChange={(e) => setFormCc(e.target.value)} placeholder="email3@banco.com.br, email4@banco.com.br" className="input-field" />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="submit"
                    disabled={salvandoForm}
                    style={{
                      padding: "8px 20px", borderRadius: 8, border: "none",
                      background: "#111827", color: "#FFD700", fontSize: 14, fontWeight: 600,
                      cursor: salvandoForm ? "not-allowed" : "pointer", opacity: salvandoForm ? 0.7 : 1,
                    }}
                  >
                    {salvandoForm ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAberto(false)}
                    disabled={salvandoForm}
                    style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
                {erroForm && <p style={{ fontSize: 13, color: "#EF4444", marginTop: 10, marginBottom: 0 }}>{erroForm}</p>}
              </form>
            ) : (
              <button
                onClick={abrirFormNovo}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff",
                  color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                + Adicionar banco parceiro
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Bloco 2: Responsável pelo RH ── */}
      <div className="card">
        <p className="section-title" style={{ marginBottom: 4 }}>Responsável pelo RH (assinatura)</p>
        <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 0, marginBottom: 20 }}>
          A assinatura cadastrada por essa pessoa em &quot;Meu Perfil&quot; é embutida na carta
        </p>

        <label style={labelStyle}>Usuário</label>
        <select
          value={responsavelId}
          onChange={(e) => setResponsavelId(e.target.value)}
          className="input-field"
          style={{ marginBottom: 16 }}
        >
          <option value="">— Nenhum —</option>
          {analistas.map((a) => (
            <option key={a.user_id} value={a.user_id}>{a.nome_completo}</option>
          ))}
        </select>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Preview da assinatura</label>
          {responsavelSelecionado?.assinatura_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={responsavelSelecionado.assinatura_url}
              alt={`Assinatura de ${responsavelSelecionado.nome_completo}`}
              style={{ maxWidth: 260, maxHeight: 100, border: "1px solid #E5E7EB", borderRadius: 8, padding: 8, background: "#fff" }}
            />
          ) : (
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
              {responsavelId ? "Esta pessoa ainda não cadastrou uma assinatura em Meu Perfil." : "Selecione um usuário."}
            </p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={salvarResponsavel}
            disabled={statusResp === "saving"}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "#111827", color: "#FFD700", fontSize: 14, fontWeight: 600,
              cursor: statusResp === "saving" ? "not-allowed" : "pointer",
              opacity: statusResp === "saving" ? 0.7 : 1,
            }}
          >
            {statusResp === "saving" ? "Salvando…" : "Salvar"}
          </button>
          <StatusBadge status={statusResp} erro={erroResp} />
        </div>
      </div>
    </div>
  );
}
