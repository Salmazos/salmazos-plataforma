"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS_KANBAN } from "@/lib/constants";
import type { Candidato } from "@/types";
import CandidatoCard from "./CandidatoCard";

interface Props {
  candidatos: Candidato[];
}

export default function KanbanBoard({ candidatos }: Props) {
  const router = useRouter();
  const [filtroCargo, setFiltroCargo] = useState("");
  const [filtroCidade, setFiltroCidade] = useState("");
  const [movendo, setMovendo] = useState<string | null>(null);

  const filtrados = candidatos.filter((c) => {
    const cargo = c.cargo_pretendido.toLowerCase();
    const cidade = c.cidade.toLowerCase();
    return (
      cargo.includes(filtroCargo.toLowerCase()) &&
      cidade.includes(filtroCidade.toLowerCase())
    );
  });

  const moverCandidato = async (id: string, novaEtapa: string) => {
    setMovendo(id);
    try {
      await fetch(`/api/candidatos/${id}/etapa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa_kanban: novaEtapa }),
      });
      router.refresh();
    } finally {
      setMovendo(null);
    }
  };

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Filtrar por cargo..."
            value={filtroCargo}
            onChange={(e) => setFiltroCargo(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Filtrar por cidade..."
            value={filtroCidade}
            onChange={(e) => setFiltroCidade(e.target.value)}
            className="input-field pl-9"
          />
        </div>

        <span className="text-sm text-gray-500 whitespace-nowrap">
          {filtrados.length} candidato{filtrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Colunas */}
      <div className="flex gap-4 overflow-x-auto pb-6">
        {ETAPAS_KANBAN.map((etapa) => {
          const cards = filtrados.filter(
            (c) => c.etapa_kanban === etapa.id
          );

          return (
            <div key={etapa.id} className="flex-shrink-0 w-72">
              {/* Header da coluna */}
              <div
                className={`${etapa.headerBg} text-white rounded-t-xl px-4 py-3 flex items-center justify-between`}
              >
                <span className="font-semibold text-sm">{etapa.label}</span>
                <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div
                className={`${etapa.columnBg} rounded-b-xl min-h-[400px] p-2 space-y-2`}
              >
                {cards.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs pt-8">
                    Nenhum candidato
                  </p>
                ) : (
                  cards.map((c) => (
                    <CandidatoCard
                      key={c.id}
                      candidato={c}
                      onMover={moverCandidato}
                      movendo={movendo === c.id}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
