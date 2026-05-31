"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS_KANBAN } from "@/lib/constants";
import type { Candidato } from "@/types";
import CandidatoCard from "./CandidatoCard";
import ModalEncaminhamento from "./ModalEncaminhamento";
import ModalCadastroRapido from "./ModalCadastroRapido";

interface Props {
  candidatos: Candidato[];
  filtroOrigem?: string | null;
}

interface PendingEncaminhamento {
  candidatoId: string;
  candidatoNome: string;
}

export default function KanbanBoard({ candidatos, filtroOrigem }: Props) {
  const router = useRouter();
  const [filtroCargo, setFiltroCargo] = useState("");
  const [filtroCidade, setFiltroCidade] = useState("");
  const [movendo, setMovendo] = useState<string | null>(null);
  const [pendingEncaminhamento, setPendingEncaminhamento] =
    useState<PendingEncaminhamento | null>(null);
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);

  const filtrados = candidatos.filter((c) => {
    const cargo = c.cargo_pretendido.toLowerCase();
    const cidade = c.cidade.toLowerCase();
    const matchOrigem =
      !filtroOrigem ||
      (c.origem ?? "Banco de talentos") === filtroOrigem;
    return (
      cargo.includes(filtroCargo.toLowerCase()) &&
      cidade.includes(filtroCidade.toLowerCase()) &&
      matchOrigem
    );
  });

  const executarMover = async (id: string, novaEtapa: string) => {
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

  const moverCandidato = async (id: string, novaEtapa: string) => {
    if (novaEtapa === "entrevista_cliente") {
      const candidato = candidatos.find((c) => c.id === id);
      setPendingEncaminhamento({
        candidatoId: id,
        candidatoNome: candidato?.nome_completo ?? "",
      });
      return;
    }
    await executarMover(id, novaEtapa);
  };

  const handleConfirmarEncaminhamento = async (dados: {
    cliente_id: string;
    data_entrevista: string;
    tipo_servico: string;
    observacoes: string;
  }) => {
    if (!pendingEncaminhamento) return;
    const { candidatoId } = pendingEncaminhamento;

    await fetch("/api/encaminhamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidato_id: candidatoId, ...dados }),
    });

    await executarMover(candidatoId, "entrevista_cliente");
    setPendingEncaminhamento(null);
  };

  return (
    <div>
      {/* Topo: Filtros + Botão Cadastro Rápido */}
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

        {/* Botão Cadastro Rápido */}
        <button
          onClick={() => setModalCadastroAberto(true)}
          className="flex items-center gap-2 bg-[#FFD700] hover:bg-[#e6c200] text-black font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Cadastro Rápido
        </button>
      </div>

      {/* Colunas */}
      <div className="flex gap-2 overflow-x-auto pb-6">
        {ETAPAS_KANBAN.map((etapa) => {
          const cards = filtrados.filter(
            (c) => c.etapa_kanban === etapa.id
          );

          return (
            <div key={etapa.id} className="flex-shrink-0 w-72">
              <div
                className={`border-t-4 ${etapa.topBorder} rounded-t-xl px-3 py-2.5 flex items-center justify-between`}
                style={{ backgroundColor: etapa.bgHex }}
              >
                <span
                  className="font-bold text-sm tracking-wide"
                  style={{ color: etapa.textHex }}
                >
                  {etapa.label}
                </span>
                <span className={`${etapa.badgeBg} ${etapa.badgeText} text-xs font-bold px-2 py-0.5 rounded-full`}>
                  {cards.length}
                </span>
              </div>

              <div
                className="rounded-b-xl min-h-[400px] p-1.5 space-y-1.5"
                style={{ backgroundColor: etapa.bgHex }}
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

      {/* Modal de encaminhamento */}
      <ModalEncaminhamento
        isOpen={!!pendingEncaminhamento}
        candidatoId={pendingEncaminhamento?.candidatoId ?? ""}
        candidatoNome={pendingEncaminhamento?.candidatoNome ?? ""}
        onClose={() => setPendingEncaminhamento(null)}
        onConfirmar={handleConfirmarEncaminhamento}
      />

      {/* Modal de cadastro rápido */}
      <ModalCadastroRapido
        isOpen={modalCadastroAberto}
        onClose={() => setModalCadastroAberto(false)}
        onCadastrado={() => router.refresh()}
      />
    </div>
  );
}