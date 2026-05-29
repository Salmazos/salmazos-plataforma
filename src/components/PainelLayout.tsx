"use client";

import { useState } from "react";
import KanbanBoard from "./KanbanBoard";
import PainelSidebar from "./PainelSidebar";
import type { Candidato } from "@/types";

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
  candidatos: Candidato[];
  totalAtivos: number;
  aprovadosNoMes: number;
  tempoMedioDias: number;
  vagas: Vaga[];
  recentes: CandidatoRecente[];
}

export default function PainelLayout({
  candidatos,
  totalAtivos,
  aprovadosNoMes,
  tempoMedioDias,
  vagas,
  recentes,
}: Props) {
  const [filtroOrigem, setFiltroOrigem] = useState<string | null>(null);

  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0">
        <KanbanBoard candidatos={candidatos} filtroOrigem={filtroOrigem} />
      </div>
      <PainelSidebar
        totalAtivos={totalAtivos}
        aprovadosNoMes={aprovadosNoMes}
        tempoMedioDias={tempoMedioDias}
        vagas={vagas}
        recentes={recentes}
        filtroOrigem={filtroOrigem}
        onFiltroOrigem={setFiltroOrigem}
      />
    </div>
  );
}
