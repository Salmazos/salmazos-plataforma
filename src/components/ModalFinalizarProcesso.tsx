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
  vaga_reaberta?: boolean;
}

const MOTIVOS_ENCERRAMENTO = [
  "Candidato desistiu",
  "Cliente cancelou a vaga",
  "Reprovado na entrevista final pelo cliente",
  "Proposta recusada pelo candidato",
  "Impedimento documental ou médico",
  "Outro",
];

const RESPONSAVEIS = [
  "Cliente",
  "Candidato",
  "Ambos",
  "Externo (vaga cancelada, corte de budget, etc.)",
];

function InfoBox({ motivo }: { motivo: string }) {
  if (!motivo) return null;

  let bg: string, border: string, color: string, text: string;

  if (motivo === "Cliente cancelou a vaga") {
    bg = "#FFFBEB"; border = "#FCD34D"; color = "#92400E";
    text = "A vaga será reaberta automaticamente e o candidato retornará ao Banco de Candidatos.";
  } else if (motivo === "Candidato desistiu" || motivo === "Proposta recusada pelo candidato") {
    bg = "#EFF6FF"; border = "#93C5FD"; color = "#1E40AF";
    text = "O candidato retornará ao Banco de Candidatos disponível para outras vagas.";
  } else {
    bg = "#F9FAFB"; border = "#E5E7EB"; color = "#374151";
    text = "O candidato retornará ao Banco de Candidatos.";
  }

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ fontSize: 13, color, margin: 0 }}>
        <strong style={{ marginRight: 4 }}>ℹ️</strong> {text}
      </p>
    </div>
  );
}

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
  const [responsavelEncerramento, setResponsavelEncerramento] = useState("");
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
      setErro("Selecione o motivo do encerramento.");
      return;
    }
    if (!isContratado && !responsavelEncerramento) {
      setErro("Selecione o responsável pelo encerramento.");
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
          ...(isContratado
            ? { data_inicio: dataInicio }
            : { motivo_reprovacao: motivoReprovacao, responsavel_encerramento: responsavelEncerramento }),
          observacoes: observacoes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao finalizar.");
        setEnviando(false);
        return;
      }
      onConfirmar({
        resultado,
        vaga_encerrada: json.vaga_encerrada,
        vaga_reaberta: json.vaga_reaberta,
      });
    } catch {
      setErro("Erro de conexão.");
      setEnviando(false);
    }
  };

  const invalidStyle = { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" };

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
                style={tentouEnviar && !dataInicio ? invalidStyle : undefined}
              />
              {tentouEnviar && !dataInicio && (
                <p className="text-red-500 text-xs mt-1">Informe a data de início.</p>
              )}
            </div>
          ) : (
            <>
              {/* Motivo */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Motivo do Encerramento *
                </label>
                <select
                  value={motivoReprovacao}
                  onChange={(e) => setMotivoReprovacao(e.target.value)}
                  className="input-field"
                  style={tentouEnviar && !motivoReprovacao ? invalidStyle : undefined}
                >
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS_ENCERRAMENTO.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {tentouEnviar && !motivoReprovacao && (
                  <p className="text-red-500 text-xs mt-1">Selecione o motivo do encerramento.</p>
                )}
              </div>

              {/* Responsável */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Responsável pelo encerramento *
                </label>
                <select
                  value={responsavelEncerramento}
                  onChange={(e) => setResponsavelEncerramento(e.target.value)}
                  className="input-field"
                  style={tentouEnviar && !responsavelEncerramento ? invalidStyle : undefined}
                >
                  <option value="">Selecione...</option>
                  {RESPONSAVEIS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {tentouEnviar && !responsavelEncerramento && (
                  <p className="text-red-500 text-xs mt-1">Selecione o responsável.</p>
                )}
              </div>

              {/* Info box contextual */}
              <InfoBox motivo={motivoReprovacao} />
            </>
          )}

          {/* Comentário */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {isContratado ? "Observações" : "Comentário"}
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
