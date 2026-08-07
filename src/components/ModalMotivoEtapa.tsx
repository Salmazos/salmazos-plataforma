"use client";

import { useState, useEffect } from "react";
import { OUTRO_MOTIVO_REPROVACAO } from "@/lib/motivos-reprovacao";

interface Props {
  isOpen: boolean;
  etapaLabel: string;
  candidatoNome: string;
  vagaTitulo?: string;
  vagaConfidencial?: boolean;
  motivos: string[];
  enviando?: boolean;
  onClose: () => void;
  onConfirmar: (motivo: string) => void;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "#111827",
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 16,
};

// Modal genérico de "motivo obrigatório" pra transições de reprovação — reutilizado
// pelo Kanban geral (CandidatoCard.tsx) e pela tela de Vaga (VagaDetalheClient.tsx).
// A lista de motivos vem por prop: quem chama decide MOTIVOS_REPROVACAO_INTERNA
// (reprovado) ou MOTIVOS_REPROVACAO_CLIENTE (reprovado_cliente).
export default function ModalMotivoEtapa({
  isOpen,
  etapaLabel,
  candidatoNome,
  vagaTitulo,
  vagaConfidencial,
  motivos,
  enviando,
  onClose,
  onConfirmar,
}: Props) {
  const [motivoSelecionado, setMotivoSelecionado] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setMotivoSelecionado("");
    setMotivoOutro("");
  }, [isOpen]);

  if (!isOpen) return null;

  const isOutroMotivo = motivoSelecionado === OUTRO_MOTIVO_REPROVACAO;
  const motivoValido = isOutroMotivo ? motivoOutro.trim().length > 0 : motivoSelecionado.trim().length > 0;

  const handleConfirmar = () => {
    if (!motivoValido) return;
    const motivoFinal = isOutroMotivo ? `Outro motivo: ${motivoOutro.trim()}` : motivoSelecionado;
    onConfirmar(motivoFinal);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !enviando) onClose(); }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "24px 28px",
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
          Mover para {etapaLabel}
        </h2>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 4px" }}>
          {candidatoNome}
        </p>
        {vagaTitulo && (
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 16px" }}>
            Vaga: {vagaTitulo}
            {vagaConfidencial && (
              <span style={{ marginLeft: 4, fontWeight: 700, color: "#DC2626" }}>🔴 CONFIDENCIAL</span>
            )}
          </p>
        )}

        <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
          Motivo da reprovação *
        </label>
        <select
          value={motivoSelecionado}
          onChange={(e) => setMotivoSelecionado(e.target.value)}
          disabled={enviando}
          style={fieldStyle}
        >
          <option value="" disabled>Selecione o motivo...</option>
          {motivos.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {isOutroMotivo && (
          <>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Descreva o motivo:
            </label>
            <textarea
              value={motivoOutro}
              onChange={(e) => setMotivoOutro(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
              disabled={enviando}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={enviando}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              background: "#fff",
              color: "#374151",
              fontSize: 13,
              fontWeight: 600,
              cursor: enviando ? "not-allowed" : "pointer",
              opacity: enviando ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!motivoValido || enviando}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "#FFB800",
              color: "#000",
              fontSize: 13,
              fontWeight: 700,
              cursor: !motivoValido || enviando ? "not-allowed" : "pointer",
              opacity: !motivoValido || enviando ? 0.6 : 1,
            }}
          >
            {enviando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
