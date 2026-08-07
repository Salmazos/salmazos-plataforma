"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS_KANBAN, ORIGEM_LABELS } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { KanbanCard } from "@/types";
import TriagemBadge from "./TriagemBadge";
import ModalEntrevistaSalmazos from "./ModalEntrevistaSalmazos";
import ModalMotivoEtapa from "./ModalMotivoEtapa";
import { MOTIVOS_REPROVACAO_INTERNA, MOTIVOS_REPROVACAO_CLIENTE } from "@/lib/motivos-reprovacao";
import { getProximasEtapas, getComportamentoEtapa, getEtapaLabel } from "@/lib/etapasCandidatura";

type Analista = { id: string; nome_completo: string; email: string };

let cachedAnalistas: Analista[] | null = null;
let fetchPromise: Promise<Analista[]> | null = null;

function fetchAnalistas(): Promise<Analista[]> {
  if (cachedAnalistas) return Promise.resolve(cachedAnalistas);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/api/analistas")
    .then((r) => r.json())
    .then((json) => {
      cachedAnalistas = json.analistas ?? [];
      return cachedAnalistas!;
    })
    .catch(() => []);
  return fetchPromise;
}

interface Props {
  card: KanbanCard;
  onMover: (cvId: string, etapa: string, comentario?: string, extras?: { cliente_id?: string; data_entrevista_salmazos?: string }) => Promise<void>;
  movendo: boolean;
}

export default function CandidatoCard({ card, onMover, movendo }: Props) {
  const router = useRouter();
  const [responsavel, setResponsavel] = useState(card.responsavel ?? "");
  const [salvando, setSalvando] = useState(false);
  const [analistas, setAnalistas] = useState<Analista[]>([]);
  const [modalEntrevistaSalmazos, setModalEntrevistaSalmazos] = useState(false);
  const [modalMotivo, setModalMotivo] = useState<{ etapa: string; tipo: "motivo_interno" | "motivo_cliente" } | null>(null);

  useEffect(() => {
    fetchAnalistas().then(setAnalistas);
  }, []);

  const handleResponsavelChange = async (novo: string) => {
    const anterior = responsavel;
    setResponsavel(novo);
    setSalvando(true);
    try {
      const res = await fetch(`/api/candidatos/${card.candidato_id}/responsavel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel: novo }),
      });
      if (!res.ok) {
        setResponsavel(anterior);
      } else {
        router.refresh();
      }
    } catch {
      setResponsavel(anterior);
    } finally {
      setSalvando(false);
    }
  };

  // Dispatch único (getComportamentoEtapa) compartilhado com VagaDetalheClient.tsx —
  // entrevista_cliente/contratado/reprovado_final vão direto pro onMover porque
  // KanbanBoard.moverCard já intercepta essas etapas e abre ModalEncaminhamento /
  // ModalFinalizarProcesso; não abrir nenhum modal aqui evita o "modal duplo" que
  // existia antes pra entrevista_cliente.
  const handleSelectChange = (value: string) => {
    if (value === "" || value === card.etapa) return;
    const comportamento = getComportamentoEtapa(value);
    if (comportamento === "entrevista_salmazos") {
      setModalEntrevistaSalmazos(true);
      return;
    }
    if (comportamento === "motivo_interno" || comportamento === "motivo_cliente") {
      setModalMotivo({ etapa: value, tipo: comportamento });
      return;
    }
    onMover(card.cv_id, value);
  };

  const handleConfirmarMotivo = async (motivo: string) => {
    if (!modalMotivo) return;
    const etapa = modalMotivo.etapa;
    setModalMotivo(null);
    await onMover(card.cv_id, etapa, motivo);
  };

  const etapaAtual = ETAPAS_KANBAN.find((e) => e.id === card.etapa) ??
    ETAPAS_KANBAN.find((e) => e.id === "entrevista_salmazos");
  const opcoes = getProximasEtapas(card.etapa, card.processo_simplificado);

  return (
    <>
      <div
        className={`bg-white rounded-lg shadow-sm border border-white/80 p-2 transition-opacity ${
          movendo ? "opacity-50" : ""
        }`}
      >
        {/* Avatar + nome */}
        <div className="flex items-start gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-full bg-black text-[#FFB800] flex items-center justify-center text-xs font-bold shrink-0">
            {card.nome_completo.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-800 text-sm leading-tight truncate">
              {card.nome_completo}
            </p>
            <p className="text-[#FFB800] text-xs font-medium truncate">
              {card.cargo_pretendido}
            </p>
            <p className="text-gray-400 text-[10px] truncate">
              Vaga: {card.vaga_titulo}
              {card.vaga_confidencial && (
                <span className="ml-1 font-bold" style={{ color: "#DC2626" }}>🔴 CONFIDENCIAL</span>
              )}
            </p>
            {card.cliente_nome && (
              <p className="text-gray-400 text-[10px] truncate">
                Cliente: {card.cliente_nome}
              </p>
            )}
            {card.triagem_score != null && card.triagem_label && (
              <div className="mt-0.5">
                <TriagemBadge score={card.triagem_score} label={card.triagem_label} size="sm" />
              </div>
            )}
            {card.etapa === "entrevista_cliente" && (
              <div className="mt-0.5">
                {card.encaminhamento_data_entrevista ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {"📅"} {formatarData(card.encaminhamento_data_entrevista)}
                  </span>
                ) : card.encaminhamento_status === "aguardando_agendamento_cliente" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {"⏳"} Aguardando agendamento do cliente
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="text-xs text-gray-400 space-y-0.5 mb-2">
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            {card.cidade}, {card.estado}
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatarData(card.candidato_created_at)}
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className={card.origem && card.origem !== "banco_talentos" ? "text-[#FFB800] font-medium" : ""}>
              {ORIGEM_LABELS[card.origem ?? "banco_talentos"] ?? card.origem}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className={`font-medium ${responsavel ? "text-gray-500" : "text-orange-500"}`}>
              {responsavel || "Sem responsável"}
            </span>
          </div>
        </div>

        {/* Responsável */}
        <div className="flex items-center gap-1 mb-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <select
            value={responsavel}
            onChange={(e) => handleResponsavelChange(e.target.value)}
            disabled={salvando}
            className="text-xs py-0.5 px-1.5 border border-gray-200 rounded-md bg-gray-50 text-gray-600 cursor-pointer disabled:opacity-50 flex-1 min-w-0 truncate"
          >
            <option value="">Sem responsável</option>
            {analistas.map((a) => <option key={a.id} value={a.nome_completo}>{a.nome_completo}</option>)}
          </select>
        </div>

        {/* Ações */}
        <div className="flex gap-1">
          <button
            onClick={() => router.push(`/painel/candidato/${card.candidato_id}`)}
            className="flex-1 text-xs py-1 px-2 bg-black text-[#FFB800] rounded-md hover:bg-gray-900 transition-colors font-medium"
          >
            Ver perfil
          </button>

          <select
            value=""
            onChange={(e) => handleSelectChange(e.target.value)}
            disabled={movendo || opcoes.length === 0}
            className="text-xs py-1 px-1 border rounded-md cursor-pointer transition-colors disabled:opacity-50 font-medium"
            style={{
              backgroundColor: etapaAtual?.bgHex ?? "#f3f4f6",
              color: etapaAtual?.textHex ?? "#374151",
              borderColor: etapaAtual?.bgHex ?? "#e5e7eb",
            }}
            title="Mover para etapa"
          >
            <option value="">Mover →</option>
            {opcoes.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <ModalEntrevistaSalmazos
        isOpen={modalEntrevistaSalmazos}
        candidato={card}
        onClose={() => setModalEntrevistaSalmazos(false)}
        onConfirmar={(dados) => {
          setModalEntrevistaSalmazos(false);
          onMover(
            card.cv_id,
            "entrevista_salmazos",
            dados.comentario || undefined,
            {
              cliente_id: dados.cliente_id || undefined,
              data_entrevista_salmazos: dados.data_entrevista_salmazos || undefined,
            },
          );
        }}
      />

      <ModalMotivoEtapa
        isOpen={!!modalMotivo}
        etapaLabel={modalMotivo ? getEtapaLabel(modalMotivo.etapa) : ""}
        candidatoNome={card.nome_completo}
        vagaTitulo={card.vaga_titulo}
        vagaConfidencial={card.vaga_confidencial}
        motivos={modalMotivo?.tipo === "motivo_cliente" ? MOTIVOS_REPROVACAO_CLIENTE : MOTIVOS_REPROVACAO_INTERNA}
        onClose={() => setModalMotivo(null)}
        onConfirmar={handleConfirmarMotivo}
      />
    </>
  );
}
