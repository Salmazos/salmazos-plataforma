"use client";

import { useState } from "react";
import type { Candidato } from "@/types";
import PerfilEdicao from "@/components/PerfilEdicao";
import EncaminhamentosSection from "@/components/EncaminhamentosSection";
import RetencaoSection from "@/components/RetencaoSection";
import HistoricoCandidato from "@/components/HistoricoCandidato";
import AvaliacoesPsicologicas from "@/components/AvaliacoesPsicologicas";

type Tab = "perfil" | "avaliacoes";

const TABS: { id: Tab; label: string }[] = [
  { id: "perfil", label: "Perfil" },
  { id: "avaliacoes", label: "Avaliações Psicológicas" },
];

export interface GarantiaInfo {
  cv_id: string;
  vaga_id: string;
  etapa: string;
  garantia_data_fim: string;
  garantia_acionada: boolean;
  garantia_acionada_em: string | null;
  vaga_titulo: string | null;
}

interface Props {
  candidato: Candidato;
  garantiaInfo?: GarantiaInfo | null;
}

export default function CandidatoPerfilTabs({ candidato, garantiaInfo }: Props) {
  const [tab, setTab] = useState<Tab>("perfil");

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #f3f4f6",
          marginBottom: "24px",
          gap: "4px",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 20px",
                fontWeight: active ? 700 : 500,
                fontSize: "14px",
                color: active ? "#111827" : "#6b7280",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: active ? "2px solid #FFB800" : "2px solid transparent",
                marginBottom: "-2px",
                background: "none",
                cursor: "pointer",
                transition: "color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "perfil" && (
        <>
          <PerfilEdicao candidato={candidato} garantiaInfo={garantiaInfo} />
          <div className="mt-6">
            <EncaminhamentosSection candidatoId={candidato.id} />
          </div>
          <div className="mt-6">
            <RetencaoSection candidatoId={candidato.id} />
          </div>
          <div className="mt-6">
            <HistoricoCandidato candidatoId={candidato.id} />
          </div>
        </>
      )}

      {tab === "avaliacoes" && (
        <AvaliacoesPsicologicas candidatoId={candidato.id} />
      )}
    </div>
  );
}
