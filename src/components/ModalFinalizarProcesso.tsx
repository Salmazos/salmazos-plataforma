"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  resultado: "contratado" | "reprovado_final";
  candidatoNome: string;
  vagaTitulo: string;
  cvId: string;
  onClose: () => void;
  onConfirmar: (res: FinalizarResult) => void;
}

export interface FinalizarResult {
  resultado: "contratado" | "reprovado_final";
  vaga_encerrada?: boolean;
}

const MOTIVOS_REPROVACAO = [
  "Perfil técnico inadequado",
  "Pretensão salarial",
  "Comportamental",
  "Candidato desistiu",
  "Outro",
];

export default function ModalFinalizarProcesso({
  isOpen,
  resultado,
  candidatoNome,
  vagaTitulo,
  cvId,
  onClose,
  onConfirmar,
}: Props) {
  const [dataInicio, setDataInicio] = useState("");
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);

  if (!isOpen) return null;

  const isContratado = resultado === "contratado";

  const handleConfirmar = async () => {
    setTentouEnviar(true);
    if (isContratado && !dataInicio) {
      setErro("Informe a data de início.");
      return;
    }
    if (!isContratado && !motivoReprovacao) {
      setErro("Selecione o motivo.");
      return;
    }

    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(`/api/candidatos-vagas/${cvId}/finalizar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultado,
          ...(isContratado ? { data_inicio: dataInicio } : { motivo_reprovacao: motivoReprovacao }),
          observacoes: observacoes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao finalizar.");
        setEnviando(false);
        return;
      }
      onConfirmar({ resultado, vaga_encerrada: json.vaga_encerrada });
    } catch {
      setErro("Erro de conexão.");
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div
          className="px-6 py-4 rounded-t-2xl text-white"
          style={{ background: isContratado ? "#065F46" : "#111827" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg">
                {isContratado ? "🎉 Finalizar — Contratação" : "Finalizar — Encerrar Processo"}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: isContratado ? "#6EE7B7" : "#FFD700" }}>
                {candidatoNome}
              </p>
              <p className="text-xs mt-0.5 text-gray-400">Vaga: {vagaTitulo}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {isContratado ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Data de Início *
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="input-field"
                style={tentouEnviar && !dataInicio ? { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" } : undefined}
              />
              {tentouEnviar && !dataInicio && (
                <p className="text-red-500 text-xs mt-1">Informe a data de início.</p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Motivo *
              </label>
              <select
                value={motivoReprovacao}
                onChange={(e) => setMotivoReprovacao(e.target.value)}
                className="input-field"
                style={tentouEnviar && !motivoReprovacao ? { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" } : undefined}
              >
                <option value="">Selecione o motivo...</option>
                {MOTIVOS_REPROVACAO.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {tentouEnviar && !motivoReprovacao && (
                <p className="text-red-500 text-xs mt-1">Selecione o motivo.</p>
              )}
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Observações
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder={isContratado ? "Salário, horário, local de trabalho..." : "Detalhes adicionais..."}
              className="input-field resize-none"
            />
          </div>

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-2 border-t">
            <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={enviando}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: isContratado ? "#16A34A" : "#374151" }}
            >
              {enviando
                ? "Salvando..."
                : isContratado
                ? "Confirmar Contratação"
                : "Encerrar Processo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
