"use client";

import { useState, useEffect, useCallback } from "react";
import RetencaoBadge from "./RetencaoBadge";
import type { CandidatoVaga } from "@/types";

interface Props {
  candidatoId: string;
}

export default function RetencaoSection({ candidatoId }: Props) {
  const [entradas, setEntradas] = useState<CandidatoVaga[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [calculando, setCalculando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/candidatos-vagas?candidato_id=${candidatoId}`);
      const { data } = await res.json();
      setEntradas(data ?? []);
    } finally {
      setCarregando(false);
    }
  }, [candidatoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleCalcular = async (cvId: string) => {
    setCalculando(cvId);
    try {
      const res = await fetch(`/api/candidatos-vagas/${cvId}/retencao`, { method: "POST" });
      if (res.ok) {
        const resultado = await res.json();
        setEntradas((prev) =>
          prev.map((e) =>
            e.id === cvId
              ? {
                  ...e,
                  retencao_score: resultado.score,
                  retencao_label: resultado.label,
                  retencao_resumo: resultado.resumo,
                  retencao_calculado_em: new Date().toISOString(),
                }
              : e
          )
        );
      }
    } finally {
      setCalculando(null);
    }
  };

  if (carregando) {
    return (
      <div className="card">
        <p className="section-title">Score de Retenção por Vaga</p>
        <div className="flex items-center gap-2 text-gray-400 text-sm py-3">
          <div className="w-4 h-4 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
          Carregando...
        </div>
      </div>
    );
  }

  if (entradas.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <p className="section-title">Score de Retenção por Vaga</p>
        <span className="text-xs text-gray-400">{entradas.length} {entradas.length === 1 ? "vaga" : "vagas"}</span>
      </div>

      <div className="space-y-3">
        {entradas.map((e) => (
          <div
            key={e.id}
            className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {e.vagas?.titulo ?? "Vaga não encontrada"}
              </p>
              {e.vagas?.cidade && (
                <p className="text-xs text-gray-400 mt-0.5">{e.vagas.cidade}</p>
              )}
              {e.retencao_resumo && (
                <p className="text-xs text-gray-500 mt-1 italic leading-snug">
                  &quot;{e.retencao_resumo}&quot;
                </p>
              )}
            </div>

            <div className="shrink-0 mt-0.5">
              {e.retencao_score != null && e.retencao_label ? (
                <RetencaoBadge score={e.retencao_score} label={e.retencao_label} size="md" />
              ) : (
                <button
                  onClick={() => handleCalcular(e.id)}
                  disabled={calculando === e.id}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: calculando === e.id ? "#e5e7eb" : "#000",
                    color: calculando === e.id ? "#6b7280" : "#FFD700",
                  }}
                >
                  {calculando === e.id ? (
                    <>
                      <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Calculando...
                    </>
                  ) : (
                    <>🔒 Calcular Retenção</>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
