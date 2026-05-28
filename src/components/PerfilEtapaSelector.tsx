"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS_KANBAN } from "@/lib/constants";
import type { EtapaKanban } from "@/types";

interface Props {
  candidatoId: string;
  etapaAtual: EtapaKanban;
}

export default function PerfilEtapaSelector({ candidatoId, etapaAtual }: Props) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<EtapaKanban>(etapaAtual);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const handleChange = async (novaEtapa: EtapaKanban) => {
    setEtapa(novaEtapa);
    setSalvando(true);
    setSalvo(false);

    await fetch(`/api/candidatos/${candidatoId}/etapa`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapa_kanban: novaEtapa }),
    });

    setSalvando(false);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  };

  const etapaObj = ETAPAS_KANBAN.find((e) => e.id === etapa);

  return (
    <div>
      <select
        value={etapa}
        onChange={(e) => handleChange(e.target.value as EtapaKanban)}
        disabled={salvando}
        className="input-field mb-2"
      >
        {ETAPAS_KANBAN.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${etapaObj?.badgeBg} ${etapaObj?.badgeText}`}
        >
          {etapaObj?.label}
        </span>
        {salvando && (
          <span className="text-xs text-gray-400 animate-pulse">Salvando...</span>
        )}
        {salvo && (
          <span className="text-xs text-green-600 font-medium">✓ Salvo</span>
        )}
      </div>
    </div>
  );
}
