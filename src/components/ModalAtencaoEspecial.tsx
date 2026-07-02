"use client";

import { useEffect, useState } from "react";

interface ClienteAlvo {
  id: string;
  nome: string;
  atencao_especial: boolean;
  nota: string | null;
}

interface Props {
  cliente: ClienteAlvo | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ModalAtencaoEspecial({ cliente, onClose, onSaved }: Props) {
  const [marcado, setMarcado] = useState(false);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (cliente) {
      setMarcado(cliente.atencao_especial);
      setNota(cliente.nota ?? "");
      setErro("");
    }
  }, [cliente]);

  if (!cliente) return null;

  async function handleSalvar() {
    if (!cliente) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(`/api/clientes/${cliente.id}/atencao-especial`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atencao_especial: marcado, nota: marcado ? nota : null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } finally {
      setEnviando(false);
    }
  }

  function handleClose() {
    if (enviando) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Atenção especial</h2>
              <p className="text-sm text-gray-500 mt-0.5">{cliente.nome}</p>
            </div>
            <button
              onClick={handleClose}
              disabled={enviando}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={marcado}
              onChange={(e) => setMarcado(e.target.checked)}
              disabled={enviando}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700">Marcar este cliente com atenção especial</span>
          </label>

          {marcado && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Nota (opcional)
              </p>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Explique o motivo da atenção especial..."
                rows={3}
                disabled={enviando}
                className="input-field resize-none text-sm disabled:opacity-50"
              />
            </div>
          )}

          {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={enviando}
              className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={enviando}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gray-900 text-white font-medium text-sm hover:bg-black transition-colors disabled:opacity-50"
            >
              {enviando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
