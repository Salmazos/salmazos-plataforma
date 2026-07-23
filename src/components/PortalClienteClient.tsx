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
  data_entrevista: string | null;
  feedback_cliente?: string;
  avaliado_em?: string;
  match_score?: number;
  vaga_titulo?: string;
  etapa_kanban?: string | null;
  responsavel_analista?: string | null;
  etapa_updated_at?: string | null;
  candidato: CandidatoResumo;
}

export interface CandidatoEmAvaliacao {
  cv_id: string;
  vaga_titulo: string;
  responsavel: string | null;
  data_entrevista_salmazos: string | null;
  updated_at: string;
  cargo_pretendido: string | null;
}

export interface EntrevistaHojeResumo {
  id: string;
  candidato_nome: string;
  hora: string;
}

interface Props {
  nomeCliente: string;
  encaminhamentos: EncaminhamentoPortal[];
  emAvaliacao: CandidatoEmAvaliacao[];
  entrevistasHoje: EntrevistaHojeResumo[];
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  aguardando: { label: "Aguardando", bg: "#FEF9C3", color: "#854D0E" },
  aprovado:   { label: "Aprovado",   bg: "#DCFCE7", color: "#166534" },
  reprovado:  { label: "Reprovado",  bg: "#FEE2E2", color: "#991B1B" },
  desistiu:   { label: "Desistiu",   bg: "#F3F4F6", color: "#4B5563" },
};

export default function PortalClienteClient({ nomeCliente, encaminhamentos, emAvaliacao, entrevistasHoje }: Props) {
  const [secaoHistorico, setSecaoHistorico] = useState(false);

  const aguardandoList = encaminhamentos.filter(
    (e) => e.status === "aguardando" || e.status === "aguardando_agendamento_cliente"
  );
  const aprovadosList  = encaminhamentos.filter((e) => e.status === "aprovado");
  const reprovadosList = encaminhamentos.filter((e) => e.status === "reprovado");
  const historicoList  = [...aprovadosList, ...reprovadosList];

  const totalGeral     = emAvaliacao.length + encaminhamentos.length;
  const emAvaliacaoCount = emAvaliacao.length;
  const aguardandoCount  = aguardandoList.length;
  const aprovadosCount   = aprovadosList.length;
  const reprovadosCount  = reprovadosList.length;

  return (
    <div>
      {/* Banner de entrevista hoje */}
      {entrevistasHoje.length > 0 && (
        <div className="mb-6 rounded-2xl p-5 shadow-sm" style={{ backgroundColor: "#000" }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">📅</span>
            <div className="min-w-0">
              <p className="font-bold text-sm" style={{ color: "#FFD700" }}>
                {entrevistasHoje.length === 1
                  ? "Você tem entrevista hoje"
                  : `Você tem ${entrevistasHoje.length} entrevistas hoje`}
              </p>
              <div className="mt-1.5 space-y-1">
                {entrevistasHoje.map((e) => (
                  <p key={e.id} className="text-sm" style={{ color: "#FDE68A" }}>
                    {e.candidato_nome} às {e.hora}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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
          { label: "Total",         value: totalGeral,      bg: "#000",    color: "#FFD700" },
          { label: "Em Avaliação",  value: emAvaliacaoCount, bg: "#DBEAFE", color: "#1D4ED8" },
          { label: "Aguardando",    value: aguardandoCount,  bg: "#FEF9C3", color: "#854D0E" },
          { label: "Aprovados",     value: aprovadosCount,   bg: "#DCFCE7", color: "#166534" },
          { label: "Reprovados",    value: reprovadosCount,  bg: "#FEE2E2", color: "#991B1B" },
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

      {/* ── SECTION 1: Em Avaliação pela Salmazos ── */}
      {emAvaliacao.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            Em Avaliação pela Salmazos
          </h2>
          <div className="space-y-3">
            {emAvaliacao.map((cv) => (
              <div
                key={cv.cv_id}
                className="rounded-2xl p-5 shadow-sm"
                style={{ backgroundColor: "#F0F7FF", border: "1px solid #BFDBFE" }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                    style={{ backgroundColor: "#E5E7EB", color: "#9CA3AF" }}
                  >
                    ?
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-blue-800 text-sm">
                      Candidato em processo de entrevista com a Salmazos
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {"📋"} {cv.vaga_titulo}
                      {cv.cargo_pretendido && (
                        <span className="text-blue-400"> · {cv.cargo_pretendido}</span>
                      )}
                    </p>
                    <p className="text-xs text-blue-400 mt-1">
                      Você será notificado quando o candidato estiver disponível para avaliação
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {cv.data_entrevista_salmazos && (
                      <p className="text-xs font-semibold text-blue-600">
                        {"📅"} {new Date(cv.data_entrevista_salmazos + "T12:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    )}
                    {cv.responsavel && (
                      <p className="text-[10px] text-blue-400 mt-0.5">
                        Responsável: {cv.responsavel}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 2: Aguardando sua Avaliação ── */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
          Aguardando sua Avaliação
        </h2>
        {aguardandoList.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-gray-400 text-sm">Nenhum candidato aguardando avaliação no momento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {aguardandoList.map((enc) => {
              const inicial = enc.candidato?.nome_completo?.charAt(0)?.toUpperCase() ?? "?";
              return (
                <div
                  key={enc.id}
                  className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
                  style={{ border: "1px solid #FDE68A" }}
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
                    <p className="text-xs mt-1 truncate" style={{ color: "#6B7280" }}>
                      {"📋"} {enc.vaga_titulo ?? "Banco de Talentos"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {enc.match_score != null && (
                      <MatchScoreBadge score={enc.match_score} size="sm" />
                    )}
                    {enc.data_entrevista && (
                      <span className="text-xs text-gray-500">
                        {"📅"} {new Date(enc.data_entrevista).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {enc.status === "aguardando_agendamento_cliente" ? (
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: "#DBEAFE", color: "#1D4ED8" }}
                      >
                        Aguardando seu agendamento
                      </span>
                    ) : (
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: "#FEF9C3", color: "#854D0E" }}
                      >
                        Aguardando
                      </span>
                    )}
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

      {/* ── SECTION 3: Histórico ── */}
      {historicoList.length > 0 && (
        <div>
          <button
            onClick={() => setSecaoHistorico((v) => !v)}
            className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2 hover:text-gray-700 transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
            Histórico ({historicoList.length})
            <svg
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: secaoHistorico ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {secaoHistorico && (
            <div className="space-y-3">
              {historicoList.map((enc) => {
                const cfg = STATUS_CONFIG[enc.status] ?? STATUS_CONFIG.aguardando;
                const inicial = enc.candidato?.nome_completo?.charAt(0)?.toUpperCase() ?? "?";
                return (
                  <div
                    key={enc.id}
                    className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 opacity-75"
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
                      <p className="text-xs mt-1 truncate" style={{ color: "#6B7280" }}>
                        {"📋"} {enc.vaga_titulo ?? "Banco de Talentos"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
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
      )}
    </div>
  );
}
