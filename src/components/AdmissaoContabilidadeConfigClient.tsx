"use client";

import { useState } from "react";

export interface DestinatarioContabilidade {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  copia: boolean;
}

interface Props {
  destinatariosIniciais: DestinatarioContabilidade[];
  remetente: string;
}

const API = "/api/admissao-contabilidade-config/email";

export default function AdmissaoContabilidadeConfigClient({ destinatariosIniciais, remetente }: Props) {
  const [destinatarios, setDestinatarios] = useState(destinatariosIniciais);
  const [erro, setErro] = useState("");

  const para = destinatarios.filter((d) => !d.copia);
  const cc = destinatarios.filter((d) => d.copia);
  const semParaAtivo = para.every((d) => !d.ativo);
  const semCcAtivo = cc.every((d) => !d.ativo);

  const handleAdicionar = async (copia: boolean, nome: string, email: string): Promise<string | null> => {
    setErro("");
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, email, copia }) });
      const json = await res.json();
      if (!res.ok) return json.error || "Erro ao adicionar destinatário.";
      setDestinatarios((prev) => [...prev, json.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      return null;
    } catch {
      return "Erro de conexão. Tente novamente.";
    }
  };

  // Otimista, mas desfaz e mostra a mensagem do servidor (ex.: trava do último Cc ativo, 409).
  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    setErro("");
    setDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo } : d)));
    try {
      const res = await fetch(`${API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo }) });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Não foi possível alterar o destinatário.");
      }
    } catch (e) {
      setDestinatarios((prev) => prev.map((d) => (d.id === id ? { ...d, ativo: !ativo } : d)));
      setErro(e instanceof Error ? e.message : "Não foi possível alterar o destinatário.");
    }
  };

  const handleRemover = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" dos destinatários da contabilidade?`)) return;
    const anterior = destinatarios;
    setErro("");
    setDestinatarios((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Não foi possível remover o destinatário.");
      }
    } catch (e) {
      setDestinatarios(anterior);
      setErro(e instanceof Error ? e.message : "Não foi possível remover o destinatário.");
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">E-mail da contabilidade (Admissões)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quem recebe o e-mail do botão &quot;Enviar por e-mail&quot; do pacote para contabilidade na tela da Admissão.
        </p>
      </div>

      {(semParaAtivo || semCcAtivo) && (
        <div className="mb-5" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px" }}>
          {semParaAtivo && (
            <p style={{ margin: 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
              ⚠️ Nenhum destinatário (Para) ativo — o envio do pacote por e-mail fica bloqueado até alguém ser adicionado ou reativado.
            </p>
          )}
          {semCcAtivo && (
            <p style={{ margin: semParaAtivo ? "6px 0 0" : 0, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
              ⚠️ Nenhum e-mail em Cópia (Cc) ativo — o envio usará um Cc mínimo de segurança até que alguém seja adicionado.
            </p>
          )}
        </div>
      )}

      <div className="card mb-6">
        <p className="section-title mb-1">Envio</p>
        <p className="text-sm text-gray-700 mb-1">
          <b>Remetente efetivo:</b> {remetente}
        </p>
        <p className="text-sm text-gray-600">O sistema exige pelo menos um destinatário em Cópia (Cc) ativo.</p>
      </div>

      {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

      <Secao
        titulo="Destinatários (Para)"
        descricao="Endereço livre — não precisa ser usuário cadastrado no painel."
        copia={false}
        itens={para}
        placeholderNome="Ex: Contabilidade"
        placeholderEmail="Ex: contabilidade@empresa.com.br"
        onAdicionar={handleAdicionar}
        onToggle={handleToggleAtivo}
        onRemover={handleRemover}
      />
      <Secao
        titulo="Cópia (Cc)"
        descricao="Recebem cópia de todo e-mail do pacote. Não é possível remover nem desativar o último Cc ativo."
        copia
        itens={cc}
        placeholderNome="Ex: RH Salmazos"
        placeholderEmail="Ex: rh@salmazos.com.br"
        onAdicionar={handleAdicionar}
        onToggle={handleToggleAtivo}
        onRemover={handleRemover}
      />
    </div>
  );
}

interface SecaoProps {
  titulo: string;
  descricao: string;
  copia: boolean;
  itens: DestinatarioContabilidade[];
  placeholderNome: string;
  placeholderEmail: string;
  onAdicionar: (copia: boolean, nome: string, email: string) => Promise<string | null>;
  onToggle: (id: string, ativo: boolean) => void;
  onRemover: (id: string, nome: string) => void;
}

function Secao({ titulo, descricao, copia, itens, placeholderNome, placeholderEmail, onAdicionar, onToggle, onRemover }: SecaoProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const msg = await onAdicionar(copia, nome, email);
    setEnviando(false);
    if (msg) { setErro(msg); return; }
    setNome("");
    setEmail("");
  };

  return (
    <div className="card mb-6">
      <p className="section-title mb-1">{titulo}</p>
      <p className="text-xs text-gray-400 mb-4">{descricao}</p>

      {itens.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Nenhum e-mail cadastrado.</p>
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
              {itens.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "#111827" }}>{d.nome}</td>
                  <td style={{ padding: "8px 12px", color: "#374151" }}>{d.email}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <input type="checkbox" checked={d.ativo} onChange={(e) => onToggle(d.id, e.target.checked)} />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <button onClick={() => onRemover(d.id, d.nome)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={adicionar} className="flex gap-2 items-end flex-wrap">
        <div style={{ flex: "1 1 160px" }}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome</label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={placeholderNome} className="input-field" required />
        </div>
        <div style={{ flex: "2 1 220px" }}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={placeholderEmail} className="input-field" required />
        </div>
        <button type="submit" disabled={enviando} className="btn-primary disabled:opacity-50">{enviando ? "Adicionando..." : "Adicionar"}</button>
      </form>
      {erro && <p className="text-red-600 text-sm mt-2">{erro}</p>}
    </div>
  );
}
