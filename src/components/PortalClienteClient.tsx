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
  candidato: CandidatoResumo;
}

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total",      value: total,      bg: "#000",     color: "#FFD700" },
          { label: "Aguardando", value: aguardando,  bg: "#FEF9C3",  color: "#854D0E" },
          { label: "Aprovados",  value: aprovados,   bg: "#DCFCE7",  color: "#166534" },
          { label: "Reprovados", value: reprovados,  bg: "#FEE2E2",  color: "#991B1B" },
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
