"use client";

import { useState } from "react";

// Bucket 'supervisao-fotos' é privado — evidencias_fotos guarda só o path no storage, nunca
// URL pública. Abrir a foto sempre passa por uma signed URL gerada sob demanda (mesmo padrão
// do bucket 'curriculos' / BotaoCurriculo.tsx). Compartilhado entre KmTab.tsx (upload/edição)
// e ModalDetalheVisitaSupervisao.tsx (visualização somente-leitura no histórico).
export default function LinkFotoSupervisao({ path, label }: { path: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const abrir = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supervisao/foto-signed-url?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (res.ok && json.url) window.open(json.url, "_blank", "noopener,noreferrer");
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={abrir}
      disabled={loading}
      style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#3B82F6", fontWeight: 600, cursor: loading ? "wait" : "pointer" }}
    >
      {loading ? "Abrindo..." : label}
    </button>
  );
}
