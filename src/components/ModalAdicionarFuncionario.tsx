"use client";

import { useEffect, useState } from "react";

interface ClienteOption {
  id: string;
  nome: string;
}

interface Props {
  isOpen: boolean;
  clientes: ClienteOption[];
  onClose: () => void;
  onCriado: () => void;
}

// R&S fica de fora de propósito — quem é R&S nunca é funcionário nosso (o cliente é o
// empregador direto desde o início), então não faz sentido cadastrar aqui.
const TIPOS_SERVICO_FUNCIONARIO = [
  { id: "mao_obra_temporaria", label: "Mão de Obra Temporária" },
  { id: "terceirizacao", label: "Terceirização de Serviços" },
];

export default function ModalAdicionarFuncionario({ isOpen, clientes, onClose, onCriado }: Props) {
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [empresaLivre, setEmpresaLivre] = useState("");
  const [cargo, setCargo] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setNomeCompleto("");
    setClienteId("");
    setEmpresaLivre("");
    setCargo("");
    setDataAdmissao("");
    setTipoServico("");
    setErro("");
  }, [isOpen]);

  if (!isOpen) return null;

  const clienteSelecionado = clientes.find((c) => c.id === clienteId);
  const empresaValida = clienteSelecionado?.nome ?? empresaLivre.trim();
  const valido = Boolean(nomeCompleto.trim() && empresaValida && tipoServico);

  const handleSalvar = async () => {
    if (!valido) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/funcionarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: nomeCompleto.trim(),
          cliente_id: clienteId || null,
          empresa: empresaValida,
          cargo: cargo.trim() || null,
          data_admissao: dataAdmissao || null,
          tipo_servico: tipoServico,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar funcionário."); return; }
      onCriado();
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Adicionar funcionário manualmente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Use isto para popular o histórico de funcionários que nunca passaram pela admissão digital da plataforma.
        </p>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome completo *</label>
          <input
            type="text" value={nomeCompleto}
            onChange={(e) => setNomeCompleto(e.target.value)}
            placeholder="Ex: Maria da Silva"
            className="input-field"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Empresa (cliente cadastrado)</label>
          <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setEmpresaLivre(""); }} className="input-field">
            <option value="">Selecione um cliente ou digite abaixo</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>

        {!clienteId && (
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ou digite o nome da empresa *</label>
            <input
              type="text" value={empresaLivre}
              onChange={(e) => setEmpresaLivre(e.target.value)}
              placeholder="Ex: Empresa não cadastrada como cliente"
              className="input-field"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cargo / função</label>
          <input
            type="text" value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Ex: Auxiliar de Produção"
            className="input-field"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de admissão</label>
          <input
            type="date" value={dataAdmissao}
            onChange={(e) => setDataAdmissao(e.target.value)}
            className="input-field"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de serviço *</label>
          <select value={tipoServico} onChange={(e) => setTipoServico(e.target.value)} className="input-field">
            <option value="">Selecione...</option>
            {TIPOS_SERVICO_FUNCIONARIO.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>Cancelar</button>
          <button onClick={handleSalvar} disabled={!valido || enviando} className="btn-primary flex-1 disabled:opacity-50">
            {enviando ? "Salvando..." : "Salvar funcionário"}
          </button>
        </div>
      </div>
    </div>
  );
}
