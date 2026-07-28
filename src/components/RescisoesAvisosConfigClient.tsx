"use client";

import { useState } from "react";

export interface EmailDestinatario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface PlataformaDestinatario {
  id: string;
  usuario_id: string;
  nome_completo: string;
}

export interface UsuarioOption {
  user_id: string;
  nome_completo: string;
  email: string;
}

interface Props {
  emailDestinatariosIniciais: EmailDestinatario[];
  plataformaDestinatariosIniciais: PlataformaDestinatario[];
  usuarios: UsuarioOption[];
}

export default function RescisoesAvisosConfigClient({
  emailDestinatariosIniciais,
  plataformaDestinatariosIniciais,
  usuarios,
}: Props) {
  const [emailDestinatarios, setEmailDestinatarios] = useState(emailDestinatariosIniciais);
  const [plataformaDestinatarios, setPlataformaDestinatarios] = useState(plataformaDestinatariosIniciais);

  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [erroEmail, setErroEmail] = useState("");

  const [processandoUsuarioId, setProcessandoUsuarioId] = useState<string | null>(null);
  const [erroPlataforma, setErroPlataforma] = useState("");

  // Nenhum destinatário ATIVO (não só "nenhuma linha") — um e-mail cadastrado mas
  // desativado tem o mesmo efeito prático de lista vazia: ninguém recebe.
  const semEmailAtivo = emailDestinatarios.every((d) => !d.ativo);
  const semPlataforma = plataformaDestinatarios.length === 0;

  // ── E-mail ───────────────────────────────────────────────────────────────

  const handleAdicionarEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoEmail(true);
    setErroEmail("");
    try {
      const res = await fetch("/api/rescisoes-avisos-config/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome, email: novoEmail }),
      });
      const json = await res.json();
      if (!res.ok) { setErroEmail(json.error || "Erro ao adicionar destinatário."); return; }
      setEmailDestinatarios((prev) => [...prev, json.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoNome("");
      setNovoEmail("");
    } catch {
      setErroEmail("Erro de conexão. Tente novamente.");
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    setEmailDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo } : d)));
    try {
      const res = await fetch(`/api/rescisoes-avisos-config/email/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEmailDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo: !ativo } : d)));
    }
  };

  const handleRemoverEmail = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" dos avisos de rescisão por e-mail?`)) return;
    const anterior = emailDestinatarios;
    setEmailDestinatarios((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/rescisoes-avisos-config/email/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setEmailDestinatarios(anterior);
    }
  };

  // ── Plataforma ───────────────────────────────────────────────────────────

  const handleTogglePlataforma = async (usuario: UsuarioOption, incluido: boolean) => {
    setProcessandoUsuarioId(usuario.user_id);
    setErroPlataforma("");
    try {
      if (incluido) {
        const res = await fetch("/api/rescisoes-avisos-config/plataforma", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario_id: usuario.user_id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro ao adicionar destinatário.");
        setPlataformaDestinatarios((prev) => [...prev, { id: json.data.id, usuario_id: usuario.user_id, nome_completo: usuario.nome_completo }]);
      } else {
        const atual = plataformaDestinatarios.find((d) => d.usuario_id === usuario.user_id);
        if (!atual) return;
        const res = await fetch(`/api/rescisoes-avisos-config/plataforma/${atual.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao remover destinatário.");
        setPlataformaDestinatarios((prev) => prev.filter((d) => d.usuario_id !== usuario.user_id));
      }
    } catch (err) {
      setErroPlataforma(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setProcessandoUsuarioId(null);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Avisos de Rescisão</h1>
        <p className="text-sm text-gray-500 mt-1">
          Lista fixa de destinatários — vale automaticamente para todo lançamento de rescisão, sem precisar escolher a cada vez.
        </p>
      </div>

      {(semEmailAtivo || semPlataforma) && (
        <div
          className="mb-5"
          style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px" }}
        >
          {semEmailAtivo && (
            <p style={{ margin: 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
              ⚠️ Nenhum destinatário de e-mail ativo — os avisos de rescisão não serão enviados por e-mail para ninguém até que alguém seja adicionado ou reativado.
            </p>
          )}
          {semPlataforma && (
            <p style={{ margin: semEmailAtivo ? "6px 0 0" : 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
              ⚠️ Nenhum destinatário de plataforma marcado — o sino e o pop-up de login não vão avisar ninguém até que alguém seja marcado abaixo.
            </p>
          )}
        </div>
      )}

      {/* ── E-mail ─────────────────────────────────────────────────────────── */}
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
                      <button onClick={() => handleRemoverEmail(d.id, d.nome)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleAdicionarEmail} className="flex gap-2 items-end flex-wrap">
          <div style={{ flex: "1 1 160px" }}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome</label>
            <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Elizabete" className="input-field" required />
          </div>
          <div style={{ flex: "2 1 220px" }}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
            <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="Ex: elizabete@salmazos.com.br" className="input-field" required />
          </div>
          <button type="submit" disabled={enviandoEmail} className="btn-primary disabled:opacity-50">
            {enviandoEmail ? "Adicionando..." : "Adicionar"}
          </button>
        </form>
        {erroEmail && <p className="text-red-600 text-sm mt-2">{erroEmail}</p>}
      </div>

      {/* ── Plataforma ─────────────────────────────────────────────────────── */}
      <div className="card">
        <p className="section-title mb-1">Destinatários de plataforma (sino + pop-up de login)</p>
        <p className="text-xs text-gray-400 mb-4">Precisa ser usuário cadastrado no painel. Marque para incluir, desmarque para remover.</p>

        {usuarios.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhum usuário ativo encontrado.</p>
        ) : (
          <div style={{ border: "1px solid #F3F4F6", borderRadius: 8, maxHeight: 320, overflowY: "auto" }}>
            {usuarios.map((u) => {
              const incluido = plataformaDestinatarios.some((d) => d.usuario_id === u.user_id);
              const processando = processandoUsuarioId === u.user_id;
              return (
                <label
                  key={u.user_id}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 border-b border-gray-100 last:border-0"
                  style={{ opacity: processando ? 0.6 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={incluido}
                    disabled={processando}
                    onChange={(e) => handleTogglePlataforma(u, e.target.checked)}
                  />
                  <span className="font-medium text-gray-900">{u.nome_completo}</span>
                  <span className="text-xs text-gray-400">{u.email}</span>
                </label>
              );
            })}
          </div>
        )}
        {erroPlataforma && <p className="text-red-600 text-sm mt-2">{erroPlataforma}</p>}
      </div>
    </div>
  );
}
