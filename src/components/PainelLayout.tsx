"use client";

import { useState } from "react";
import KanbanBoard from "./KanbanBoard";
import PainelSidebar from "./PainelSidebar";
import type { KanbanCard } from "@/types";

interface Vaga {
  cargo: string;
  count: number;
}

interface CandidatoRecente {
  id: string;
  nome_completo: string;
  cargo_pretendido: string;
  created_at: string;
}

interface Props {
  cards: KanbanCard[];
  totalAtivos: number;
  aprovadosNoMes: number;
  tempoMedioDias: number;
  vagas: Vaga[];
  recentes: CandidatoRecente[];
  analistaLogado: string;
}

export default function PainelLayout({
  cards,
  totalAtivos,
  aprovadosNoMes,
  tempoMedioDias,
  vagas,
  recentes,
  analistaLogado,
}: Props) {
  const [filtroOrigem, setFiltroOrigem] = useState<string | null>(null);
  const [metricasVisiveis, setMetricasVisiveis] = useState(false);

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Painel de métricas com toggle */}
      <div className="w-full">
        {metricasVisiveis ? (
          <div className="relative">
            <PainelSidebar
              totalAtivos={totalAtivos}
              aprovadosNoMes={aprovadosNoMes}
              tempoMedioDias={tempoMedioDias}
              vagas={vagas}
              recentes={recentes}
              filtroOrigem={filtroOrigem}
              onFiltroOrigem={setFiltroOrigem}
              horizontal
            />
            <button
              onClick={() => setMetricasVisiveis(false)}
              title="Ocultar métricas"
              className="absolute -top-1 right-0 flex items-center gap-1.5 text-xs text-black font-semibold bg-[#FFD700] hover:bg-[#e6c200] border border-[#FFD700] rounded-lg px-2.5 py-1.5 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Ocultar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-sm font-medium text-gray-500">Métricas</span>
            </div>
            <button
              onClick={() => setMetricasVisiveis(true)}
              title="Mostrar métricas"
              className="flex items-center gap-1.5 text-xs text-black font-semibold bg-[#FFD700] hover:bg-[#e6c200] border border-[#FFD700] rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Mostrar
            </button>
          </div>
        )}
      </div>

      {/* Kanban abaixo */}
      <KanbanBoard cards={cards} filtroOrigem={filtroOrigem} analistaLogado={analistaLogado} />
    </div>
  );
}
