"use client";

import { useState, useEffect } from "react";

const TIPO_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  recrutamento_selecao: { label: "R&S", bg: "#1D6FA4", color: "#fff" },
  mao_obra_temporaria:  { label: "MOT", bg: "#FFD700", color: "#000" },
  terceirizacao:        { label: "Terceirização", bg: "#1D9E75", color: "#fff" },
};

interface Solicitacao {
  id: string;
  cliente_nome: string;
  cargo: string;
  tipo_servico: string;
  num_posicoes: number;
  cidade: string | null;
  estado: string | null;
  salario: string | null;
  horario_texto: string | null;
  previsao_inicio: string | null;
  requisitos: string | null;
  beneficios: string | null;
  beneficios_chips: Record<string, boolean> | null;
  observacoes: string | null;
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVagaCriada: () => void;
}

export default function ModalSolicitacoesVagas({ isOpen, onClose, onVagaCriada }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Solicitacao[]>([]);
  const [toast, setToast] = useState("");
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/solicitacoes-vagas")
      .then((r) => r.json())
      .then((json) => setItems(json.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const handleCriarVaga = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/vagas/from-solicitacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solicitacao_id: id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== id));
        showToast("Vaga criada com sucesso!");
        onVagaCriada();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecusar = async (id: string) => {
    if (!motivoRecusa.trim()) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/solicitacoes-vagas/${id}/recusar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo_recusa: motivoRecusa.trim() }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== id));
        setRecusandoId(null);
        setMotivoRecusa("");
        showToast("Solicitação recusada.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const benChipsList = (chips: Record<string, boolean> | null) => {
    if (!chips) return [];
    return Object.entries(chips).filter(([, v]) => v).map(([k]) => k);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">{"📬"} Solicitações de Vagas Pendentes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">Carregando...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-3">{"🎉"}</p>
              <p className="text-gray-500 text-sm font-medium">Nenhuma solicitação pendente!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((s) => {
                const tipo = TIPO_LABEL[s.tipo_servico] ?? { label: s.tipo_servico, bg: "#6B7280", color: "#fff" };
                const isRecusando = recusandoId === s.id;
                const isLoading = actionLoading === s.id;

                return (
                  <div key={s.id} className="border border-gray-200 rounded-xl p-5 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm">{s.cliente_nome}</span>
                      <span className="text-gray-300">—</span>
                      <span className="font-semibold text-gray-800 text-sm">{s.cargo}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: tipo.bg, color: tipo.color }}
                      >
                        {tipo.label}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {new Date(s.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{s.num_posicoes} posição{s.num_posicoes !== 1 ? "ões" : ""}</span>
                      {s.cidade && <span>{"📍"} {s.cidade}/{s.estado}</span>}
                      {s.previsao_inicio && (
                        <span>{"📅"} Previsão: {s.previsao_inicio.split("-").reverse().join("/")}</span>
                      )}
                      {s.salario && <span>{"💰"} {s.salario}</span>}
                    </div>

                    {s.horario_texto && (
                      <p className="text-xs text-gray-500">
                        {"🕐"} {s.horario_texto}
                      </p>
                    )}

                    {/* Requisitos (collapsible) */}
                    {s.requisitos && (
                      <div>
                        <button
                          onClick={() => setExpandedReq(expandedReq === s.id ? null : s.id)}
                          className="text-xs text-blue-600 underline underline-offset-2"
                        >
                          {expandedReq === s.id ? "Ocultar requisitos" : "Ver requisitos"}
                        </button>
                        {expandedReq === s.id && (
                          <pre className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3">
                            {s.requisitos}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Benefícios chips */}
                    {s.beneficios_chips && benChipsList(s.beneficios_chips).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {benChipsList(s.beneficios_chips).map((b) => (
                          <span key={b} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#DCFCE7", color: "#166534" }}>
                            {b}
                          </span>
                        ))}
                      </div>
                    )}

                    {s.observacoes && (
                      <p className="text-xs text-gray-500 italic">
                        {"💬"} {s.observacoes}
                      </p>
                    )}

                    {/* Recusa inline */}
                    {isRecusando && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                        <label className="block text-xs font-semibold text-red-700">Motivo da recusa *</label>
                        <textarea
                          value={motivoRecusa}
                          onChange={(e) => setMotivoRecusa(e.target.value)}
                          placeholder="Descreva o motivo..."
                          rows={2}
                          className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setRecusandoId(null); setMotivoRecusa(""); }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleRecusar(s.id)}
                            disabled={!motivoRecusa.trim() || isLoading}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                          >
                            {isLoading ? "Recusando..." : "Confirmar Recusa"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {!isRecusando && (
                      <div className="flex gap-2 justify-end pt-1 border-t border-gray-100">
                        <button
                          onClick={() => { setRecusandoId(s.id); setMotivoRecusa(""); }}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {"❌"} Recusar
                        </button>
                        <button
                          onClick={() => handleCriarVaga(s.id)}
                          disabled={isLoading}
                          className="text-xs px-4 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                          style={{ backgroundColor: "#16a34a", color: "#fff" }}
                        >
                          {isLoading ? "Criando..." : "✅ Criar Vaga"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl shadow-lg text-sm font-semibold"
            style={{ backgroundColor: "#065F46", color: "#fff" }}
          >
            {"✅"} {toast}
          </div>
        )}
      </div>
    </div>
  );
}
