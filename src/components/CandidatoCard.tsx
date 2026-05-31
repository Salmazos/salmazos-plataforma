"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS_KANBAN } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { Candidato } from "@/types";

const ANALISTAS = ["Giovanni", "Kaynara", "Rebecca", "Andreza", "Lucas", "Edivan", "Bete", "Olver"];

interface Props {
  candidato: Candidato;
  onMover: (id: string, etapa: string) => Promise<void>;
  movendo: boolean;
}

export default function CandidatoCard({ candidato, onMover, movendo }: Props) {
  const router = useRouter();
  const [responsavel, setResponsavel] = useState(candidato.responsavel ?? "");
  const [salvando, setSalvando] = useState(false);

  const handleResponsavelChange = async (novo: string) => {
    const anterior = responsavel;
    setResponsavel(novo);
    setSalvando(true);
    try {
      const res = await fetch(`/api/candidatos/${candidato.id}/responsavel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel: novo }),
      });
      if (!res.ok) setResponsavel(anterior);
    } catch {
      setResponsavel(anterior);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-white/80 p-3 transition-opacity ${
        movendo ? "opacity-50" : ""
      }`}
    >
      {/* Avatar + nome */}
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-full bg-black text-[#FFB800] flex items-center justify-center text-sm font-bold shrink-0">
          {candidato.nome_completo.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-tight truncate">
            {candidato.nome_completo}
          </p>
          <p className="text-[#FFB800] text-xs font-medium truncate">
            {candidato.cargo_pretendido}
          </p>
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-gray-400 space-y-0.5 mb-3">
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          {candidato.cidade}, {candidato.estado}
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {formatarData(candidato.created_at)}
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className={candidato.origem && candidato.origem !== "Banco de talentos" ? "text-[#FFB800] font-medium" : ""}>
            {candidato.origem ?? "Banco de talentos"}
          </span>
        </div>
      </div>

      {/* Responsável */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <svg
          className="w-3.5 h-3.5 text-gray-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <select
          value={responsavel}
          onChange={(e) => handleResponsavelChange(e.target.value)}
          disabled={salvando}
          className="text-xs py-0.5 px-1.5 border border-gray-200 rounded-md bg-gray-50 text-gray-600 cursor-pointer disabled:opacity-50 flex-1 min-w-0 truncate"
        >
          <option value="">Sem responsável</option>
          {ANALISTAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Ações */}
      <div className="flex gap-1.5">
        <button
          onClick={() => router.push(`/painel/candidato/${candidato.id}`)}
          className="flex-1 text-xs py-1.5 px-2 bg-black text-[#FFB800] rounded-md hover:bg-gray-900 transition-colors font-medium"
        >
          Ver perfil
        </button>

        {(() => {
          const etapaAtual = ETAPAS_KANBAN.find((e) => e.id === candidato.etapa_kanban);
          return (
            <select
              value={candidato.etapa_kanban}
              onChange={(e) => onMover(candidato.id, e.target.value)}
              disabled={movendo}
              className="text-xs py-1.5 px-1.5 border rounded-md cursor-pointer transition-colors disabled:opacity-50 font-medium"
              style={{
                backgroundColor: etapaAtual?.bgHex ?? "#f3f4f6",
                color: etapaAtual?.textHex ?? "#374151",
                borderColor: etapaAtual?.bgHex ?? "#e5e7eb",
              }}
              title="Mover para etapa"
            >
              {ETAPAS_KANBAN.map((e) => (
                <option
                  key={e.id}
                  value={e.id}
                  style={{ backgroundColor: e.bgHex, color: e.textHex }}
                >
                  {e.label}
                </option>
              ))}
            </select>
          );
        })()}
      </div>
    </div>
  );
}
