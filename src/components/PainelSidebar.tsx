"use client";

import Link from "next/link";
import { formatarData } from "@/lib/utils";
import { ORIGEM_LABELS } from "@/lib/constants";

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
  totalAtivos: number;
  aprovadosNoMes: number;
  tempoMedioDias: number;
  vagas: Vaga[];
  recentes: CandidatoRecente[];
  filtroOrigem: string | null;
  onFiltroOrigem: (v: string | null) => void;
  horizontal?: boolean;
  isFullAccess?: boolean;
}

export default function PainelSidebar({
  totalAtivos,
  aprovadosNoMes,
  tempoMedioDias,
  vagas,
  recentes,
  filtroOrigem,
  onFiltroOrigem,
  horizontal = false,
  isFullAccess = false,
}: Props) {
  return (
    <aside className={horizontal ? "grid grid-cols-1 md:grid-cols-3 gap-4 w-full" : "w-72 shrink-0 space-y-4"}>

      {/* ── Métricas rápidas ── */}
      <div className="card">
        <p className="section-title">
          {isFullAccess ? "Métricas Gerais — Toda a Equipe" : "Minhas Métricas"}
        </p>
        {!isFullAccess && (
          <p className="text-xs text-gray-400 -mt-1 mb-2">Apenas seus candidatos</p>
        )}
        <div className={`divide-y divide-gray-50 ${horizontal ? "" : ""}`}>
          <MetricaItem
            label="Candidatos ativos"
            valor={totalAtivos}
            compact={horizontal}
            icone={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <MetricaItem
            label="Aprovados no mês"
            valor={aprovadosNoMes}
            destaque
            compact={horizontal}
            icone={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <MetricaItem
            label="Tempo médio de seleção"
            valor={`${tempoMedioDias} dias`}
            compact={horizontal}
            icone={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>
      </div>

      {/* ── Candidaturas por vaga ── */}
      <div className="card">
        <p className="section-title">Candidaturas por vaga</p>

        {vagas.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-3">
            Nenhum candidato cadastrado
          </p>
        ) : (
          <ul className={`space-y-0.5 ${horizontal ? "overflow-y-auto max-h-36" : "space-y-1"}`}>
            {/* Botão Todos */}
            <li>
              <button
                onClick={() => onFiltroOrigem(null)}
                className={`w-full text-left flex items-center justify-between px-3 rounded-lg text-sm font-medium transition-colors
                  ${horizontal ? "py-1.5" : "py-2"}
                  ${filtroOrigem === null
                    ? "bg-black text-[#FFD700]"
                    : "text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <span>Todos</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-2
                  ${filtroOrigem === null
                    ? "bg-[#FFD700] text-black"
                    : "bg-gray-100 text-gray-500"
                  }`}>
                  {vagas.reduce((s, v) => s + v.count, 0)}
                </span>
              </button>
            </li>

            {/* Botões por vaga/origem */}
            {vagas.map((v) => {
              const ativo = filtroOrigem === v.cargo;
              return (
                <li key={v.cargo}>
                  <button
                    onClick={() => onFiltroOrigem(ativo ? null : v.cargo)}
                    className={`w-full text-left flex items-center justify-between px-3 rounded-lg text-sm transition-colors
                      ${horizontal ? "py-1.5" : "py-2"}
                      ${ativo
                        ? "bg-black text-[#FFD700] font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    <span className="truncate">{ORIGEM_LABELS[v.cargo] ?? v.cargo}</span>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ml-2
                      ${ativo
                        ? "bg-[#FFD700] text-black"
                        : "bg-black text-[#FFB800]"
                      }`}>
                      {v.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Atividade recente ── */}
      <div className="card">
        <p className="section-title">Atividade recente</p>
        {recentes.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-3">
            Nenhum candidato ainda
          </p>
        ) : (
          <ul className={`${horizontal ? "space-y-2 overflow-y-auto max-h-36" : "space-y-3"}`}>
            {recentes.map((c) => (
              <li key={c.id}>
                <Link href={`/painel/candidato/${c.id}`} className="flex items-start gap-2.5 group">
                  <div className="w-7 h-7 rounded-full bg-black text-[#FFB800] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {c.nome_completo.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate group-hover:text-black transition-colors">
                      {c.nome_completo}
                    </p>
                    <p className="text-xs text-[#FFB800] font-medium truncate">
                      {c.cargo_pretendido}
                    </p>
                    <p className="text-xs text-gray-400">{formatarData(c.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

    </aside>
  );
}

function MetricaItem({
  label,
  valor,
  icone,
  destaque = false,
  compact = false,
}: {
  label: string;
  valor: string | number;
  icone: React.ReactNode;
  destaque?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${compact ? "py-1.5" : "py-2.5"}`}>
      <div className="flex items-center gap-2 text-gray-500">
        {icone}
        <span className="text-sm">{label}</span>
      </div>
      <span className={`font-bold ${compact ? "text-lg" : "text-xl"} ${destaque ? "text-green-600" : "text-black"}`}>
        {valor}
      </span>
    </div>
  );
}
