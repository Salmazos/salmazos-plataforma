"use client";

import { useState } from "react";

export interface EmailDestinatario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

interface Props {
  emailDestinatariosIniciais: EmailDestinatario[];
}

export default function CobrancaRSAvisosConfigClient({ emailDestinatariosIniciais }: Props) {
  const [emailDestinatarios, setEmailDestinatarios] = useState(emailDestinatariosIniciais);

  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  // Nenhum destinatário ATIVO (não só "nenhuma linha") — um e-mail cadastrado mas
  // desativado tem o mesmo efeito prático de lista vazia: ninguém recebe.
  const semEmailAtivo = emailDestinatarios.every((d) => !d.ativo);

  const handleAdicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/cobranca-rs-avisos-config/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome, email: novoEmail }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao adicionar destinatário."); return; }
      setEmailDestinatarios((prev) => [...prev, json.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoNome("");
      setNovoEmail("");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    setEmailDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo } : d)));
    try {
      const res = await fetch(`/api/cobranca-rs-avisos-config/email/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEmailDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo: !ativo } : d)));
    }
  };

  const handleRemover = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" dos avisos de Cobrança R&S?`)) return;
    const anterior = emailDestinatarios;
    setEmailDestinatarios((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/cobranca-rs-avisos-config/email/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setEmailDestinatarios(anterior);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Avisos de Cobrança R&S</h1>
        <p className="text-sm text-gray-500 mt-1">
          Lista fixa de destinatários — recebe o e-mail sempre que uma cobrança R&S for aprovada e enviada.
        </p>
      </div>

      {semEmailAtivo && (
        <div
          className="mb-5"
          style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px" }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
            ⚠️ Nenhum destinatário de e-mail ativo — os avisos de cobrança R&S não serão enviados para ninguém até que alguém seja adicionado ou reativado.
          </p>
        </div>
      )}

      <div className="card mb-6">
        <p className="section-title mb-1">Destinatários de e-mail</p>
        <p className="text-xs text-gray-400 mb-4">Endereço livre — não precisa ser usuário cadastrado no painel.</p>

        {emailDestinatarios.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum destinatário cadastrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }} className="mb-4">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  {["Nome", "E-mail", "Ativo", "Ações"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emailDestinatarios.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#111827" }}>{d.nome}</td>
                    <td style={{ padding: "8px 12px", color: "#374151" }}>{d.email}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={d.ativo} onChange={(e) => handleToggleAtivo(d.id, e.target.checked)} />
                      </label>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={() => handleRemover(d.id, d.nome)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleAdicionar} className="flex gap-2 items-end flex-wrap">
          <div style={{ flex: "1 1 160px" }}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome</label>
            <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Elizabete" className="input-field" required />
          </div>
          <div style={{ flex: "2 1 220px" }}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
            <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="Ex: elizabete@salmazos.com.br" className="input-field" required />
          </div>
          <button type="submit" disabled={enviando} className="btn-primary disabled:opacity-50">
            {enviando ? "Adicionando..." : "Adicionar"}
          </button>
        </form>
        {erro && <p className="text-red-600 text-sm mt-2">{erro}</p>}
      </div>
    </div>
  );
}
