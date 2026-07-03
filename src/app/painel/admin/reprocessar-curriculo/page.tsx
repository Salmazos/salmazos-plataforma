"use client";

import { useRef, useState } from "react";

export default function ReprocessarCurriculoPage() {
  const [running, setRunning] = useState(false);
  const [processados, setProcessados] = useState(0);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function iniciar() {
    setErro(null);
    setProcessados(0);
    setRestantes(null);
    stopRef.current = false;
    setRunning(true);

    try {
      while (!stopRef.current) {
        const res = await fetch("/api/admin/reprocessar-curriculo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 3 }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setErro(json.error ?? `Erro ${res.status}`);
          break;
        }

        const json = await res.json();
        setProcessados((prev) => prev + json.processed);
        setRestantes(json.remaining);

        if (json.remaining === 0 || json.processed === 0) break;
      }
    } finally {
      setRunning(false);
    }
  }

  function parar() {
    stopRef.current = true;
  }

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
        Reprocessar currículos
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={iniciar}
          disabled={running}
          style={{
            padding: "8px 16px",
            background: running ? "#D1D5DB" : "#111827",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          Iniciar reprocessamento de currículos
        </button>
        <button
          onClick={parar}
          disabled={!running}
          style={{
            padding: "8px 16px",
            background: "#fff",
            color: "#111827",
            border: "1px solid #D1D5DB",
            borderRadius: 6,
            cursor: !running ? "not-allowed" : "pointer",
          }}
        >
          Parar
        </button>
      </div>

      <p style={{ fontSize: 14, color: "#374151" }}>
        Processados: {processados}
        {restantes !== null ? ` | Restantes: ${restantes}` : ""}
      </p>

      {erro && (
        <p style={{ fontSize: 14, color: "#DC2626", marginTop: 8 }}>{erro}</p>
      )}
    </div>
  );
}
