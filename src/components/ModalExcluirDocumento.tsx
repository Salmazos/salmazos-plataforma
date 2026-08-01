"use client";

import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  titulo: string;
  descricao: string;
  // Endpoint DELETE (ex: /api/funcionarios/asos/{id} ou /api/funcionarios/contratos/{id}) —
  // o motivo obrigatório vai no corpo, o soft-delete acontece no backend (ver
  // funcionarioDocumentoExcluirSchema em lib/schemas.ts).
  endpoint: string;
  onClose: () => void;
  onExcluido: () => void;
}

// Modal genérico de "excluir com justificativa obrigatória" reusado pelas linhas de ASO
// Periódico e Contrato em FuncionarioDetalheClient.tsx — mesmo padrão de confirmação com
// motivo já usado em outras ações sensíveis da plataforma (ex: cancelar admissão).
export default function ModalExcluirDocumento({ isOpen, titulo, descricao, endpoint, onClose, onExcluido }: Props) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setMotivo("");
    setErro("");
  }, [isOpen]);

  if (!isOpen) return null;

  const valido = motivo.trim().length > 0;

  const handleExcluir = async () => {
    if (!valido) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(json.error || "Erro ao excluir."); return; }
      onExcluido();
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{titulo}</h2>
        <p className="text-xs text-gray-500 mb-4">{descricao}</p>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Motivo da exclusão *
        </label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="Ex: Arquivo enviado no campo errado por engano"
          className="input-field resize-none"
        />

        {erro && <p className="text-red-600 text-sm mt-3">{erro}</p>}

        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="btn-outline flex-1">Cancelar</button>
          <button
            onClick={handleExcluir}
            disabled={!valido || enviando}
            className="flex-1 text-sm font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ background: "#DC2626" }}
          >
            {enviando ? "Excluindo..." : "Confirmar exclusão"}
          </button>
        </div>
      </div>
    </div>
  );
}
