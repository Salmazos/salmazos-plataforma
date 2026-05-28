"use client";

import { useState } from "react";

interface Props {
  candidatoId: string;
  anotacoesIniciais?: string;
}

export default function PerfilAnotacoes({ candidatoId, anotacoesIniciais }: Props) {
  const [anotacoes, setAnotacoes] = useState(anotacoesIniciais ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleSalvar = async () => {
    setSalvando(true);
    setSalvo(false);
    setErro(null);

    const res = await fetch(`/api/candidatos/${candidatoId}/anotacoes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anotacoes }),
    });

    if (!res.ok) {
      setErro("Falha ao salvar. Tente novamente.");
    } else {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    }
    setSalvando(false);
  };

  return (
    <div>
      <textarea
        value={anotacoes}
        onChange={(e) => setAnotacoes(e.target.value)}
        rows={7}
        placeholder="Adicione observações internas sobre este candidato..."
        className="input-field resize-none mb-2 text-sm"
      />

      {erro && (
        <p className="text-red-500 text-xs mb-2">{erro}</p>
      )}

      <button
        onClick={handleSalvar}
        disabled={salvando}
        className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2"
      >
        {salvando ? (
          <>
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Salvando...
          </>
        ) : salvo ? (
          "✓ Anotações salvas!"
        ) : (
          "Salvar anotações"
        )}
      </button>
    </div>
  );
}
