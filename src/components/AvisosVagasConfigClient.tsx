"use client";

import { useState } from "react";

export interface EmailDestinatario {
  id: string;
  evento: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface PlataformaDestinatario {
  id: string;
  evento: string;
  usuario_id: string;
  nome_completo: string;
}

export interface UsuarioOption {
  user_id: string;
  nome_completo: string;
  email: string;
}

interface ConfigEvento {
  email_ativo: boolean;
  email_destinatarios: EmailDestinatario[];
  plataforma_destinatarios: PlataformaDestinatario[];
}

interface Props {
  configsPorEvento: Record<string, ConfigEvento>;
  usuarios: UsuarioOption[];
}

const EVENTOS_CONFIG = [
  { id: "vaga_criada", label: "Nova Vaga Cadastrada" },
  { id: "solicitacao_vaga", label: "Nova Solicitação de Vaga" },
  { id: "vaga_fechada", label: "Vaga Fechada" },
  { id: "vaga_cancelada", label: "Vaga Cancelada" },
  { id: "vaga_reativada", label: "Vaga Reativada" },
];

export default function AvisosVagasConfigClient({ configsPorEvento, usuarios }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<string>("vaga_criada");
  const [configs, setConfigs] = useState(configsPorEvento);

  const [emailAtivo, setEmailAtivo] = useState<Record<string, boolean>>(
    Object.fromEntries(EVENTOS_CONFIG.map(({ id }) => [id, configs[id]?.email_ativo ?? true]))
  );
  const [salvandoEmailAtivo, setSalvandoEmailAtivo] = useState<Record<string, boolean>>({});
  const [emailDestinatarios, setEmailDestinatarios] = useState<Record<string, EmailDestinatario[]>>(
    Object.fromEntries(EVENTOS_CONFIG.map(({ id }) => [id, configs[id]?.email_destinatarios ?? []]))
  );
  const [plataformaDestinatarios, setPlataformaDestinatarios] = useState<Record<string, PlataformaDestinatario[]>>(
    Object.fromEntries(EVENTOS_CONFIG.map(({ id }) => [id, configs[id]?.plataforma_destinatarios ?? []]))
  );

  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [erroEmail, setErroEmail] = useState("");

  const [processandoUsuarioId, setProcessandoUsuarioId] = useState<string | null>(null);
  const [erroPlataforma, setErroPlataforma] = useState("");

  const config = configs[abaAtiva] || { email_ativo: true, email_destinatarios: [], plataforma_destinatarios: [] };
  const semEmailAtivo = emailAtivo[abaAtiva] && emailDestinatarios[abaAtiva]?.every((d) => !d.ativo);
  const semPlataforma = plataformaDestinatarios[abaAtiva]?.length === 0;

  // ── E-mail ───────────────────────────────────────────────────────────────

  const handleToggleEmailAtivo = async (ativo: boolean) => {
    setSalvandoEmailAtivo((prev) => ({ ...prev, [abaAtiva]: true }));
    setErroEmail("");
    setEmailAtivo((prev) => ({ ...prev, [abaAtiva]: ativo }));
    try {
      const res = await fetch("/api/avisos-vagas-config/email-ativo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento: abaAtiva, email_ativo: ativo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEmailAtivo((prev) => ({ ...prev, [abaAtiva]: !ativo }));
      setErroEmail("Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvandoEmailAtivo((prev) => ({ ...prev, [abaAtiva]: false }));
    }
  };

  const handleAdicionarEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoEmail(true);
    setErroEmail("");
    try {
      const res = await fetch("/api/avisos-vagas-config/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento: abaAtiva, nome: novoNome, email: novoEmail }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroEmail(json.error || "Erro ao adicionar destinatário.");
        return;
      }
      setEmailDestinatarios((prev) => ({
        ...prev,
        [abaAtiva]: [...(prev[abaAtiva] || []), json.data].sort((a, b) => a.nome.localeCompare(b.nome)),
      }));
      setNovoNome("");
      setNovoEmail("");
    } catch {
      setErroEmail("Erro de conexão. Tente novamente.");
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    setEmailDestinatarios((prev) => ({
      ...prev,
      [abaAtiva]: (prev[abaAtiva] || []).map((d) => (d.id === id ? { ...d, ativo } : d)),
    }));
    try {
      const res = await fetch(`/api/avisos-vagas-config/email/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEmailDestinatarios((prev) => ({
        ...prev,
        [abaAtiva]: (prev[abaAtiva] || []).map((d) => (d.id === id ? { ...d, ativo: !ativo } : d)),
      }));
    }
  };

  const handleRemoverEmail = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" dos avisos de vaga?`)) return;
    const anterior = emailDestinatarios[abaAtiva];
    setEmailDestinatarios((prev) => ({
      ...prev,
      [abaAtiva]: (prev[abaAtiva] || []).filter((d) => d.id !== id),
    }));
    try {
      const res = await fetch(`/api/avisos-vagas-config/email/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setEmailDestinatarios((prev) => ({
        ...prev,
        [abaAtiva]: anterior,
      }));
    }
  };

  // ── Plataforma ───────────────────────────────────────────────────────────

  const handleTogglePlataforma = async (usuario: UsuarioOption, incluido: boolean) => {
    setProcessandoUsuarioId(usuario.user_id);
    setErroPlataforma("");
    try {
      if (incluido) {
        const res = await fetch("/api/avisos-vagas-config/plataforma", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evento: abaAtiva, usuario_id: usuario.user_id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro ao adicionar destinatário.");
        setPlataformaDestinatarios((prev) => ({
          ...prev,
          [abaAtiva]: [...(prev[abaAtiva] || []), { id: json.data.id, evento: abaAtiva, usuario_id: usuario.user_id, nome_completo: usuario.nome_completo }],
        }));
      } else {
        const atual = (plataformaDestinatarios[abaAtiva] || []).find((d) => d.usuario_id === usuario.user_id);
        if (!atual) return;
        const res = await fetch(`/api/avisos-vagas-config/plataforma/${atual.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao remover destinatário.");
        setPlataformaDestinatarios((prev) => ({
          ...prev,
          [abaAtiva]: (prev[abaAtiva] || []).filter((d) => d.usuario_id !== usuario.user_id),
        }));
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
        <h1 className="text-xl font-bold text-gray-900">Avisos de Vagas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Destinatários para cada tipo de evento de vaga. Se nenhum estiver configurado, segue o comportamento padrão (todos os analistas da unidade).
        </p>
      </div>

      {/* ── Abas ────────────────────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", overflowX: "auto" }}>
          {EVENTOS_CONFIG.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setAbaAtiva(id)}
              style={{
                flex: "0 0 auto",
                padding: "12px 16px",
                borderBottom: abaAtiva === id ? "2px solid #FFD700" : "2px solid transparent",
                backgroundColor: abaAtiva === id ? "#FFFBEB" : "transparent",
                color: abaAtiva === id ? "#000" : "#6B7280",
                fontWeight: abaAtiva === id ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Conteúdo da aba ────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 16 }}>
          <p className="text-xs text-gray-400 mb-4 italic">
            Sem destinatários configurados, o aviso segue o comportamento padrão (todos os analistas da unidade).
          </p>

          {(semEmailAtivo || semPlataforma) && (
            <div
              className="mb-5"
              style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px" }}
            >
              {semEmailAtivo && (
                <p style={{ margin: 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
                  ⚠️ Nenhum destinatário de e-mail ativo — os avisos não serão enviados por e-mail até que alguém seja adicionado ou reativado.
                </p>
              )}
              {semPlataforma && (
                <p style={{ margin: semEmailAtivo ? "6px 0 0" : 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
                  ⚠️ Nenhum destinatário de plataforma — o sino não vai avisar ninguém até que alguém seja marcado abaixo.
                </p>
              )}
            </div>
          )}

          {/* ── E-mail ─────────────────────────────────────────────────────────── */}
          <div className="mb-6">
            <label className="flex items-start gap-3 mb-4 pb-4 border-b border-gray-100 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={emailAtivo[abaAtiva]}
                disabled={salvandoEmailAtivo[abaAtiva]}
                onChange={(e) => handleToggleEmailAtivo(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-semibold text-gray-900">Enviar os avisos também por e-mail</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {emailAtivo[abaAtiva]
                    ? "Ligado — além do sino, os destinatários abaixo recebem e-mail."
                    : "Desligado — os avisos saem só no sino. A lista abaixo fica guardada para quando o e-mail for ligado."}
                </span>
              </span>
            </label>

            <div style={{ opacity: emailAtivo[abaAtiva] ? 1 : 0.55 }}>
              <p className="section-title mb-1">Destinatários de e-mail</p>
              <p className="text-xs text-gray-400 mb-4">Endereço livre — não precisa ser usuário cadastrado no painel.</p>

              {emailDestinatarios[abaAtiva]?.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum destinatário cadastrado.</p>
              ) : (
                <div style={{ overflowX: "auto" }} className="mb-4">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                        {["Nome", "E-mail", "Ativo", "Ações"].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "8px 12px",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#6B7280",
                              textTransform: "uppercase",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {emailDestinatarios[abaAtiva]?.map((d) => (
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
                  <input
                    type="text"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Ex: Elizabete"
                    className="input-field"
                    required
                  />
                </div>
                <div style={{ flex: "2 1 220px" }}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
                  <input
                    type="email"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    placeholder="Ex: elizabete@salmazos.com.br"
                    className="input-field"
                    required
                  />
                </div>
                <button type="submit" disabled={enviandoEmail} className="btn-primary disabled:opacity-50">
                  {enviandoEmail ? "Adicionando..." : "Adicionar"}
                </button>
              </form>
            </div>
            {erroEmail && <p className="text-red-600 text-sm mt-2">{erroEmail}</p>}
          </div>

          {/* ── Plataforma ─────────────────────────────────────────────────────── */}
          <div>
            <p className="section-title mb-1">Destinatários de plataforma (sino + pop-up de login)</p>
            <p className="text-xs text-gray-400 mb-4">Precisa ser usuário cadastrado no painel. Marque para incluir, desmarque para remover.</p>

            {usuarios.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum usuário ativo encontrado.</p>
            ) : (
              <div style={{ border: "1px solid #F3F4F6", borderRadius: 8, maxHeight: 320, overflowY: "auto" }}>
                {usuarios.map((u) => {
                  const incluido = (plataformaDestinatarios[abaAtiva] || []).some((d) => d.usuario_id === u.user_id);
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
      </div>
    </div>
  );
}
