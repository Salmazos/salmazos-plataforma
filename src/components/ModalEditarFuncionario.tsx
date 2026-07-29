"use client";

import { useEffect, useState } from "react";
import type { FuncionarioDetalhe } from "./FuncionarioDetalheClient";

interface ClienteOption {
  id: string;
  nome: string;
}

interface Props {
  isOpen: boolean;
  funcionario: FuncionarioDetalhe;
  clientes: ClienteOption[];
  onClose: () => void;
  onSalvo: (funcionarioAtualizado: FuncionarioDetalhe) => void;
}

const TIPOS_SERVICO_FUNCIONARIO = [
  { id: "mao_obra_temporaria", label: "Mão de Obra Temporária" },
  { id: "terceirizacao", label: "Terceirização de Serviços" },
];

export default function ModalEditarFuncionario({ isOpen, funcionario, clientes, onClose, onSalvo }: Props) {
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [cargo, setCargo] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [empresaLivre, setEmpresaLivre] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  // Vínculo (cliente_id preenchido) ou cadastro manual (empresa livre) — fixo conforme o
  // estado atual do registro, não é possível trocar de modo nesta tela.
  const vinculadoACliente = Boolean(funcionario.cliente_id);

  useEffect(() => {
    if (!isOpen) return;
    setNomeCompleto(funcionario.nome_completo);
    setCargo(funcionario.cargo ?? "");
    setDataAdmissao(funcionario.data_admissao ?? "");
    setEmpresaLivre(funcionario.empresa ?? "");
    setClienteId(funcionario.cliente_id ?? "");
    setTipoServico(funcionario.tipo_servico ?? "");
    setErro("");
  }, [isOpen, funcionario]);

  if (!isOpen) return null;

  const valido = Boolean(nomeCompleto.trim() && (vinculadoACliente ? clienteId : empresaLivre.trim()));

  const handleSalvar = async () => {
    if (!valido) return;
    setEnviando(true);
    setErro("");
    try {
      const payload: Record<string, unknown> = {
        nome_completo: nomeCompleto.trim(),
        cargo: cargo.trim() || null,
        data_admissao: dataAdmissao || null,
      };
      if (vinculadoACliente) {
        payload.cliente_id = clienteId;
      } else {
        payload.empresa = empresaLivre.trim();
      }
      // Deixado sem seleção = não mexe no valor atual (mantém null se ainda pendente de
      // preenchimento retroativo) — diferente do cadastro manual, aqui não é obrigatório.
      if (tipoServico) payload.tipo_servico = tipoServico;

      const res = await fetch(`/api/funcionarios/${funcionario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar."); return; }
      onSalvo(json.data);
      onClose();
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
        <h2 className="text-lg font-bold text-gray-900 mb-1">Editar funcionário</h2>
        <p className="text-xs text-gray-400 mb-4">Corrige dados de cadastro — não afeta ASO nem contrato.</p>

        {funcionario.admissao_id && (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#1D4ED8" }}>
              ℹ️ Este funcionário veio de uma admissão digital — editar aqui não altera o registro original da admissão.
            </p>
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome completo</label>
          <input
            type="text" value={nomeCompleto}
            onChange={(e) => setNomeCompleto(e.target.value)}
            className="input-field"
          />
        </div>

        {vinculadoACliente ? (
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Empresa</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="input-field">
              <option value="">Selecione...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Empresa</label>
            <input
              type="text" value={empresaLivre}
              onChange={(e) => setEmpresaLivre(e.target.value)}
              className="input-field"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cargo</label>
          <input
            type="text" value={cargo}
            onChange={(e) => setCargo(e.target.value)}
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
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de serviço</label>
          <select value={tipoServico} onChange={(e) => setTipoServico(e.target.value)} className="input-field">
            <option value="">Não informado</option>
            {TIPOS_SERVICO_FUNCIONARIO.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button onClick={handleSalvar} disabled={!valido || enviando} className="btn-primary flex-1 disabled:opacity-50">
            {enviando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
