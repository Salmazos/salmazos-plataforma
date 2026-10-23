"use client";

import { useEffect, useState } from "react";
import type { DisponivelAdmissao } from "./AdmissoesClient";

export interface ResultadoDesistencia {
  vagaReaberta: boolean;
  avisos: string[];
}

interface Props {
  item: DisponivelAdmissao | null;
  onClose: () => void;
  onConcluido: (resultado: ResultadoDesistencia) => void;
}

const MOTIVO_MIN = 5;
const MOTIVO_MAX = 500;

const rotulo: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };

// Candidato "contratado" que desistiu antes de ter admissão: registra o motivo (obrigatório), tira o candidato da lista e,
// se a vaga tinha fechado por preencher as posições, pergunta se ela deve voltar a ficar aberta.
export default function ModalCandidatoDesistiu({ item, onClose, onConcluido }: Props) {
  const [motivo, setMotivo] = useState("");
  const [reabrir, setReabrir] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!item) return;
    setMotivo("");
    setReabrir(true);
    setErro("");
    setEnviando(false);
  }, [item]);

  if (!item) return null;

  const vagaFechada = item.vagas?.status === "fechada";
  const motivoValido = motivo.trim().length >= MOTIVO_MIN;

  const confirmar = async () => {
    if (!motivoValido || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(`/api/candidatos-vagas/${item.id}/desistencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim(), reabrir_vaga: vagaFechada && reabrir }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível registrar a desistência.");
        return;
      }
      onConcluido({ vagaReaberta: json.vaga_reaberta === true, avisos: Array.isArray(json.avisos) ? json.avisos : [] });
    } catch {
      setErro("Não foi possível registrar a desistência. Verifique a conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget && !enviando) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Candidato desistiu" style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 440, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Candidato desistiu</h2>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 2px" }}>{item.candidatos?.nome_completo ?? "—"}</p>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 14px" }}>Vaga: {item.vagas?.titulo ?? "—"}</p>
        <p style={{ fontSize: 12, color: "#4B5563", margin: "0 0 14px" }}>
          A candidatura sai de Contratado e vai para Não tem Interesse, a alocação do candidato é desfeita e a posição volta a ficar livre na vaga.
        </p>

        <label htmlFor="motivo-desistencia" style={rotulo}>Motivo da desistência *</label>
        <textarea
          id="motivo-desistencia"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={MOTIVO_MAX}
          rows={3}
          disabled={enviando}
          placeholder="Ex.: aceitou outra proposta e avisou por telefone"
          style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 4 }}
        />
        <p style={{ fontSize: 11, color: motivoValido || motivo.length === 0 ? "#9CA3AF" : "#B45309", margin: "0 0 14px", textAlign: "right" }}>
          {motivo.trim().length}/{MOTIVO_MAX}{!motivoValido && motivo.length > 0 ? ` — mínimo de ${MOTIVO_MIN} caracteres` : ""}
        </p>

        {vagaFechada && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#111827", marginBottom: 14, cursor: enviando ? "not-allowed" : "pointer" }}>
            <input type="checkbox" checked={reabrir} onChange={(e) => setReabrir(e.target.checked)} disabled={enviando} style={{ marginTop: 3 }} />
            <span>Reabrir a vaga (ela fechou ao preencher as posições)</span>
          </label>
        )}

        {erro && (
          <div role="alert" style={{ fontSize: 12, color: "#991B1B", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={enviando} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: enviando ? "not-allowed" : "pointer", opacity: enviando ? 0.6 : 1 }}>
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!motivoValido || enviando} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: !motivoValido || enviando ? "not-allowed" : "pointer", opacity: !motivoValido || enviando ? 0.6 : 1 }}>
            {enviando ? "Registrando…" : "Confirmar desistência"}
          </button>
        </div>
      </div>
    </div>
  );
}
