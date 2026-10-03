"use client";

import { useState } from "react";

export interface DestinatarioContabilidade {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

interface Props {
  destinatariosIniciais: DestinatarioContabilidade[];
  ccFixo: string[];
  remetente: string;
}

const API = "/api/admissao-contabilidade-config/email";

export default function AdmissaoContabilidadeConfigClient({ destinatariosIniciais, ccFixo, remetente }: Props) {
  const [destinatarios, setDestinatarios] = useState(destinatariosIniciais);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const semAtivo = destinatarios.every((d) => !d.ativo);

  const handleAdicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novoNome, email: novoEmail }) });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao adicionar destinatário."); return; }
      setDestinatarios((prev) => [...prev, json.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoNome("");
      setNovoEmail("");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    setErro("");
    setDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo } : d)));
    try {
      const res = await fetch(`${API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo }) });
      if (!res.ok) throw new Error();
    } catch {
      setDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo: !ativo } : d)));
      setErro("Não foi possível alterar o destinatário.");
    }
  };

  const handleRemover = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" dos destinatários da contabilidade?`)) return;
    const anterior = destinatarios;
    setErro("");
    setDestinatarios((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setDestinatarios(anterior);
      setErro("Não foi possível remover o destinatário.");
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">E-mail da contabilidade (Admissões)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quem recebe, no campo &quot;Para&quot;, o e-mail do botão &quot;Enviar por e-mail&quot; do pacote para contabilidade na tela da Admissão.
        </p>
      </div>

      {semAtivo && (
        <div className="mb-5" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
            ⚠️ Nenhum destinatário ativo — o envio do pacote por e-mail fica bloqueado até alguém ser adicionado ou reativado.
          </p>
        </div>
      )}

      <div className="card mb-6">
        <p className="section-title mb-1">Envio</p>
        <p className="text-sm text-gray-700 mb-1">
          <b>Cc obrigatório (fixo, não editável aqui):</b> {ccFixo.join(", ")}
        </p>
        <p className="text-sm text-gray-700">
          <b>Remetente efetivo:</b> {remetente}
        </p>
      </div>

      <div className="card">
        <p className="section-title mb-1">Destinatários (Para)</p>
        <p className="text-xs text-gray-400 mb-4">Endereço livre — não precisa ser usuário cadastrado no painel.</p>

        {destinatarios.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum destinatário cadastrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }} className="mb-4">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  {["Nome", "E-mail", "Ativo", "Ações"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {destinatarios.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#111827" }}>{d.nome}</td>
                    <td style={{ padding: "8px 12px", color: "#374151" }}>{d.email}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <input type="checkbox" checked={d.ativo} onChange={(e) => handleToggleAtivo(d.id, e.target.checked)} />
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={() => handleRemover(d.id, d.nome)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>Remover</button>
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
            <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Contabilidade" className="input-field" required />
          </div>
          <div style={{ flex: "2 1 220px" }}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
            <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="Ex: contabilidade@empresa.com.br" className="input-field" required />
          </div>
          <button type="submit" disabled={enviando} className="btn-primary disabled:opacity-50">{enviando ? "Adicionando..." : "Adicionar"}</button>
        </form>
        {erro && <p className="text-red-600 text-sm mt-2">{erro}</p>}
      </div>
    </div>
  );
}
