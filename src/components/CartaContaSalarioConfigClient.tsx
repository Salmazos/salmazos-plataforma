"use client";

import { useEffect, useState } from "react";

interface Analista {
  user_id: string;
  nome_completo: string;
  assinatura_url: string | null;
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

export default function CartaContaSalarioConfigClient({ analistas }: Props) {
  const [loading, setLoading] = useState(true);
  const [erroGlobal, setErroGlobal] = useState("");

  const [para, setPara] = useState("");
  const [cc, setCc] = useState("");
  const [statusDest, setStatusDest] = useState<Status>("idle");
  const [erroDest, setErroDest] = useState("");

  const [responsavelId, setResponsavelId] = useState("");
  const [statusResp, setStatusResp] = useState<Status>("idle");
  const [erroResp, setErroResp] = useState("");

  useEffect(() => {
    fetch("/api/configuracoes/carta-conta-salario")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setErroGlobal(json.error);
          return;
        }
        setPara(json.para ?? "");
        setCc(json.cc ?? "");
        setResponsavelId(json.responsavel_rh_user_id ?? "");
      })
      .catch(() => setErroGlobal("Erro ao carregar configuração."))
      .finally(() => setLoading(false));
  }, []);

  const salvarDestinatarios = async () => {
    setStatusDest("saving");
    setErroDest("");
    try {
      const res = await fetch("/api/configuracoes/carta-conta-salario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para, cc }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setStatusDest("ok");
      setTimeout(() => setStatusDest("idle"), 2500);
    } catch (err) {
      setErroDest(err instanceof Error ? err.message : String(err));
      setStatusDest("error");
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
          Destinatários padrão e responsável pela assinatura na carta enviada ao banco parceiro
        </p>
      </div>

      {erroGlobal && (
        <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "12px 16px", borderRadius: 8, fontSize: 14, marginBottom: 20 }}>
          {erroGlobal}
        </div>
      )}

      {/* ── Bloco 1: Destinatários padrão ── */}
      <div className="card" style={{ marginBottom: 28 }}>
        <p className="section-title" style={{ marginBottom: 4 }}>Destinatários padrão</p>
        <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 0, marginBottom: 20 }}>
          Pré-preenchem o modal da carta — continuam editáveis na hora do envio
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>Para</label>
            <input
              value={para}
              onChange={(e) => setPara(e.target.value)}
              placeholder="email1@banco.com.br, email2@banco.com.br"
              className="input-field"
            />
          </div>
          <div>
            <label style={labelStyle}>Cc</label>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="email3@banco.com.br, email4@banco.com.br"
              className="input-field"
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          <button
            onClick={salvarDestinatarios}
            disabled={statusDest === "saving"}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "#111827", color: "#FFD700", fontSize: 14, fontWeight: 600,
              cursor: statusDest === "saving" ? "not-allowed" : "pointer",
              opacity: statusDest === "saving" ? 0.7 : 1,
            }}
          >
            {statusDest === "saving" ? "Salvando…" : "Salvar"}
          </button>
          <StatusBadge status={statusDest} erro={erroDest} />
        </div>
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
