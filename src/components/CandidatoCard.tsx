"use client";

import { useRouter } from "next/navigation";
import { ETAPAS_KANBAN } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { Candidato } from "@/types";

interface Props {
  candidato: Candidato;
  onMover: (id: string, etapa: string) => Promise<void>;
  movendo: boolean;
}

export default function CandidatoCard({ candidato, onMover, movendo }: Props) {
  const router = useRouter();

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
      </div>

      {/* Ações */}
      <div className="flex gap-1.5">
        <button
          onClick={() => router.push(`/painel/candidato/${candidato.id}`)}
          className="flex-1 text-xs py-1.5 px-2 bg-black text-[#FFB800] rounded-md hover:bg-gray-900 transition-colors font-medium"
        >
          Ver perfil
        </button>

        <select
          value={candidato.etapa_kanban}
          onChange={(e) => onMover(candidato.id, e.target.value)}
          disabled={movendo}
          className="text-xs py-1.5 px-1.5 border border-gray-200 rounded-md text-gray-600 bg-white cursor-pointer hover:border-gray-300 transition-colors disabled:opacity-50"
          title="Mover para etapa"
        >
          {ETAPAS_KANBAN.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
