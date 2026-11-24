"use client";

import { useEffect, useState } from "react";
import { fundoSoLeitura } from "@/lib/fundoDaJanela";
import { TOKEN_VALIDADE_DIAS } from "@/lib/admissaoValidade";

export interface LinkRenovado {
  token: string;
  token_expira_em: string;
}

interface Props {
  // Admissão a renovar; null = janela fechada.
  alvo: { id: string; nome: string } | null;
  onClose: () => void;
  onRenovado: (id: string, link: LinkRenovado) => void;
}

// Confirmação de "Renovar link" (RH > Admissões): o link antigo para de funcionar, nasce um novo e o que o candidato já preencheu continua salvo.
export default function ModalRenovarLink({ alvo, onClose, onRenovado }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setEnviando(false);
    setErro("");
  }, [alvo]);

  if (!alvo) return null;

  const fechar = () => { if (!enviando) onClose(); };

  const renovar = async () => {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch(`/api/admissoes/${alvo.id}/renovar-link`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(json.error ?? "Não foi possível renovar o link."); return; }
      onRenovado(alvo.id, { token: json.data.token, token_expira_em: json.data.token_expira_em });
    } catch {
      setErro("Não foi possível renovar o link. Verifique a conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} {...fundoSoLeitura(fechar)}>
      <div role="dialog" aria-modal="true" aria-label="Renovar link" style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: 440, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Renovar link</h2>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 14px" }}>{alvo.nome}</p>
        <p data-texto-renovar style={{ fontSize: 13, color: "#374151", margin: "0 0 14px", lineHeight: 1.5 }}>
          O link antigo vai parar de funcionar e um novo será criado, válido por {TOKEN_VALIDADE_DIAS} dias. O que o candidato já preencheu continua salvo. Depois de renovar, envie o link novo ao candidato.
        </p>
        {erro && (
          <div role="alert" style={{ fontSize: 12, color: "#991B1B", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{erro}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={fechar} disabled={enviando} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: enviando ? "not-allowed" : "pointer" }}>
            Cancelar
          </button>
          <button onClick={renovar} disabled={enviando} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#111827", color: "#FFD700", fontSize: 13, fontWeight: 700, cursor: enviando ? "wait" : "pointer", opacity: enviando ? 0.7 : 1 }}>
            {enviando ? "Renovando…" : "Renovar"}
          </button>
        </div>
      </div>
    </div>
  );
}
