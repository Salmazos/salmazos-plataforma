"use client";

import { useState } from "react";
import Link from "next/link";
import MatchScoreBadge from "./MatchScoreBadge";

interface CandidatoResumo {
  id: string;
  nome_completo: string;
  cargo_pretendido: string;
  cidade: string;
  estado: string;
  habilidades: string[];
}

export interface EncaminhamentoPortal {
  id: string;
  status: string;
  data_entrevista: string;
  feedback_cliente?: string;
  avaliado_em?: string;
  match_score?: number;
  vaga_titulo?: string;
  etapa_kanban?: string | null;
  responsavel_analista?: string | null;
  etapa_updated_at?: string | null;
  candidato: CandidatoResumo;
}

const ETAPAS_PIPELINE = [
  { id: "triagem", label: "Triagem" },
  { id: "entrevista_salmazos", label: "Entrevista Salmazos" },
  { id: "entrevista_cliente", label: "Entrevista Cliente" },
  { id: "aprovado_cliente", label: "Retorno" },
] as const;

const ETAPA_INDEX: Record<string, number> = {};
ETAPAS_PIPELINE.forEach((e, i) => { ETAPA_INDEX[e.id] = i; });

interface Props {
  nomeCliente: string;
  encaminhamentos: EncaminhamentoPortal[];
}

type Filtro = "todos" | "aguardando" | "aprovado" | "reprovado";

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  aguardando: { label: "Aguardando", bg: "#FEF9C3", color: "#854D0E" },
  aprovado:   { label: "Aprovado",   bg: "#DCFCE7", color: "#166534" },
  reprovado:  { label: "Reprovado",  bg: "#FEE2E2", color: "#991B1B" },
  desistiu:   { label: "Desistiu",   bg: "#F3F4F6", color: "#4B5563" },
};

export default function PortalClienteClient({ nomeCliente, encaminhamentos }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const total      = encaminhamentos.length;
  const aprovados  = encaminhamentos.filter((e) => e.status === "aprovado").length;
  const reprovados = encaminhamentos.filter((e) => e.status === "reprovado").length;
  const aguardando = encaminhamentos.filter((e) => e.status === "aguardando").length;

  const emProcesso = encaminhamentos.filter(
    (e) => e.etapa_kanban && ETAPA_INDEX[e.etapa_kanban] !== undefined
  );
  const emProcessoCount = emProcesso.length;

  const filtrados =
    filtro === "todos" ? encaminhamentos : encaminhamentos.filter((e) => e.status === filtro);

  const FILTROS: { id: Filtro; label: string; count: number }[] = [
    { id: "todos",     label: "Todos",      count: total },
    { id: "aguardando", label: "Aguardando", count: aguardando },
    { id: "aprovado",  label: "Aprovados",  count: aprovados },
    { id: "reprovado", label: "Reprovados", count: reprovados },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Olá, {nomeCliente}!</h1>
        <p className="text-gray-500 text-sm mt-1">
          Confira os candidatos encaminhados para sua empresa.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total",       value: total,          bg: "#000",     color: "#FFD700" },
          { label: "Em Processo", value: emProcessoCount, bg: "#DBEAFE",  color: "#1D4ED8" },
          { label: "Aguardando",  value: aguardando,      bg: "#FEF9C3",  color: "#854D0E" },
          { label: "Aprovados",   value: aprovados,       bg: "#DCFCE7",  color: "#166534" },
          { label: "Reprovados",  value: reprovados,      bg: "#FEE2E2",  color: "#991B1B" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm"
            style={{ backgroundColor: card.bg }}
          >
            <span className="text-3xl font-bold" style={{ color: card.color }}>
              {card.value}
            </span>
            <span className="text-xs font-medium mt-1" style={{ color: card.color, opacity: 0.75 }}>
              {card.label}
            </span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
            style={
              filtro === f.id
                ? { backgroundColor: "#000", color: "#FFD700" }
                : { backgroundColor: "#fff", color: "#374151", border: "1px solid #E5E7EB" }
            }
          >
            {f.label}
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
              style={
                filtro === f.id
                  ? { backgroundColor: "#FFD700", color: "#000" }
                  : { backgroundColor: "#F3F4F6", color: "#6B7280" }
              }
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Processos em Andamento */}
      {emProcesso.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
            Processos em Andamento
          </h2>
          <div className="space-y-3">
            {emProcesso.map((enc) => {
              const currentIdx = ETAPA_INDEX[enc.etapa_kanban!] ?? 0;
              const inicial = enc.candidato?.nome_completo?.charAt(0)?.toUpperCase() ?? "?";

              return (
                <div
                  key={`pipeline-${enc.id}`}
                  className="bg-white rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: "#000", color: "#FFD700" }}
                    >
                      {inicial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {enc.candidato?.nome_completo ?? "–"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {enc.vaga_titulo ?? "Banco de Talentos"}
                        {enc.responsavel_analista && (
                          <span className="ml-2 text-gray-400">
                            {"·"} Responsável: {enc.responsavel_analista}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {enc.etapa_kanban === "entrevista_cliente" && enc.data_entrevista && (
                        <p className="text-xs font-semibold text-blue-600">
                          {"📅"} Entrevista: {new Date(enc.data_entrevista + "T12:00:00").toLocaleDateString("pt-BR")}
                        </p>
                      )}
                      {enc.etapa_updated_at && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Atualizado em {new Date(enc.etapa_updated_at).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Pipeline steps */}
                  <div className="flex items-center gap-1">
                    {ETAPAS_PIPELINE.map((etapa, idx) => {
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      let bg = "#F3F4F6";
                      let fg = "#9CA3AF";
                      if (isCompleted) { bg = "#DCFCE7"; fg = "#166534"; }
                      if (isCurrent) { bg = "#FFD700"; fg = "#000"; }

                      return (
                        <div key={etapa.id} className="flex items-center flex-1 min-w-0">
                          <div
                            className="flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold truncate"
                            style={{ backgroundColor: bg, color: fg }}
                          >
                            {isCompleted && "✓ "}{etapa.label}
                          </div>
                          {idx < ETAPAS_PIPELINE.length - 1 && (
                            <svg className="w-3 h-3 text-gray-300 shrink-0 mx-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Candidate list */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <p className="text-gray-400 text-sm">Nenhum candidato encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((enc) => {
            const cfg = STATUS_CONFIG[enc.status] ?? STATUS_CONFIG.aguardando;
            const inicial = enc.candidato?.nome_completo?.charAt(0)?.toUpperCase() ?? "?";

            return (
              <div
                key={enc.id}
                className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                  style={{ backgroundColor: "#000", color: "#FFD700" }}
                >
                  {inicial}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {enc.candidato?.nome_completo ?? "–"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {enc.candidato?.cargo_pretendido}
                    {enc.candidato?.cidade && ` · ${enc.candidato.cidade}/${enc.candidato.estado}`}
                  </p>
                  <p
                    className="text-xs mt-1 truncate"
                    style={{ color: "#6B7280" }}
                  >
                    📋 {enc.vaga_titulo ?? "Banco de Talentos"}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {enc.match_score != null && (
                    <MatchScoreBadge score={enc.match_score} size="sm" />
                  )}
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                  <Link
                    href={`/portal/candidato/${enc.id}`}
                    className="text-sm px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-black hover:text-black transition-colors"
                  >
                    Ver perfil
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
