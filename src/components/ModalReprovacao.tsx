"use client";

import { useState } from "react";
import type { Candidato } from "@/types";
import { ETAPAS_KANBAN } from "@/lib/constants";
import { MOTIVOS_REPROVACAO_INTERNA, OUTRO_MOTIVO_REPROVACAO } from "@/lib/motivos-reprovacao";

type Acao = "retornar_banco" | "reprovar" | "negativar";

interface Props {
  isOpen: boolean;
  candidato: Candidato;
  onClose: () => void;
  onReprovado: () => void;
}

export default function ModalReprovacao({ isOpen, candidato, onClose, onReprovado }: Props) {
  const [motivoSelecionado, setMotivoSelecionado] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const etapaLabel =
    ETAPAS_KANBAN.find((e) => e.id === candidato.etapa_kanban)?.label ??
    candidato.etapa_kanban;

  const isOutroMotivo = motivoSelecionado === OUTRO_MOTIVO_REPROVACAO;
  const motivoValido = isOutroMotivo ? motivoOutro.trim().length > 0 : motivoSelecionado.trim().length > 0;

  async function handleAction(action: Acao) {
    if (!motivoValido) return;
    const motivoFinal = isOutroMotivo ? `Outro motivo: ${motivoOutro.trim()}` : motivoSelecionado;
    setEnviando(true);
    try {
      await fetch(`/api/candidatos/${candidato.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, motivo: motivoFinal, etapa: candidato.etapa_kanban }),
      });
      setMotivoSelecionado("");
      setMotivoOutro("");
      onReprovado();
      onClose();
    } finally {
      setEnviando(false);
    }
  }

  function handleClose() {
    if (enviando) return;
    setMotivoSelecionado("");
    setMotivoOutro("");
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Reprovar candidato</h2>
              <p className="text-sm text-gray-500 mt-0.5">{candidato.nome_completo}</p>
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

          {/* Etapa atual */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Etapa de reprovação
            </p>
            <div className="text-sm font-medium text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              {etapaLabel}
            </div>
          </div>

          {/* Motivo */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Motivo da reprovação *
            </p>
            <select
              value={motivoSelecionado}
              onChange={(e) => setMotivoSelecionado(e.target.value)}
              disabled={enviando}
              className="input-field text-sm disabled:opacity-50"
            >
              <option value="" disabled>Selecione o motivo...</option>
              {MOTIVOS_REPROVACAO_INTERNA.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {isOutroMotivo && (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 mt-3">
                  Descreva o motivo:
                </p>
                <textarea
                  value={motivoOutro}
                  onChange={(e) => setMotivoOutro(e.target.value)}
                  placeholder="Descreva o motivo..."
                  rows={3}
                  disabled={enviando}
                  className="input-field resize-none text-sm disabled:opacity-50"
                />
              </>
            )}
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleAction("retornar_banco")}
              disabled={enviando || !motivoValido}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-medium text-sm hover:bg-blue-100 transition-colors disabled:opacity-50 text-left flex items-start gap-3"
            >
              <span className="text-base shrink-0 mt-0.5">↩</span>
              <div>
                <div>Retornar ao banco de talentos</div>
                <div className="text-xs font-normal text-blue-500 mt-0.5">
                  Volta para Triagem · permanece ativo no sistema
                </div>
              </div>
            </button>

            <button
              onClick={() => handleAction("reprovar")}
              disabled={enviando || !motivoValido}
              className="w-full py-2.5 px-4 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium text-sm hover:bg-red-100 transition-colors disabled:opacity-50 text-left flex items-start gap-3"
            >
              <span className="text-base shrink-0 mt-0.5">✕</span>
              <div>
                <div>Reprovar definitivamente</div>
                <div className="text-xs font-normal text-red-400 mt-0.5">
                  Remove do Kanban · consta nos relatórios
                </div>
              </div>
            </button>

            <button
              onClick={() => handleAction("negativar")}
              disabled={enviando || !motivoValido}
              className="w-full py-2.5 px-4 rounded-xl bg-gray-900 border border-gray-800 text-white font-medium text-sm hover:bg-black transition-colors disabled:opacity-50 text-left flex items-start gap-3"
            >
              <span className="text-base shrink-0 mt-0.5">⊘</span>
              <div>
                <div>Negativar candidato</div>
                <div className="text-xs font-normal text-gray-400 mt-0.5">
                  Remove permanentemente · nunca mais aparece
                </div>
              </div>
            </button>
          </div>

          <button
            onClick={handleClose}
            disabled={enviando}
            className="w-full mt-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
