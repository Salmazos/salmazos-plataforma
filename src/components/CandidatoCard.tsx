"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS_KANBAN } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { KanbanCard } from "@/types";
import TriagemBadge from "./TriagemBadge";

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

type EtapaOption = { value: string; label: string };

const OPCOES_POR_ETAPA: Record<string, EtapaOption[]> = {
  triagem: [
    { value: "entrevista_salmazos", label: "Entrevista Salmazos" },
    { value: "nao_tem_interesse", label: "Não tem Interesse" },
    { value: "reprovado", label: "Reprovado" },
    { value: "bloqueado", label: "Bloqueado" },
  ],
  entrevista_salmazos: [
    { value: "entrevista_cliente", label: "Entrevista Cliente" },
    { value: "nao_tem_interesse", label: "Não tem Interesse" },
    { value: "reprovado", label: "Reprovado" },
    { value: "bloqueado", label: "Bloqueado" },
  ],
  entrevista_cliente: [
    { value: "aprovado_cliente", label: "Aprovado pelo Cliente" },
    { value: "reprovado_cliente", label: "Reprovado pelo Cliente" },
    { value: "nao_tem_interesse", label: "Não tem Interesse" },
    { value: "nao_compareceu", label: "Não Compareceu" },
    { value: "bloqueado", label: "Bloqueado" },
  ],
  aprovado_cliente: [
    { value: "contratado", label: "Contratado" },
    { value: "reprovado_final", label: "Reprovado" },
  ],
};

interface Props {
  card: KanbanCard;
  onMover: (cvId: string, etapa: string, comentario?: string) => Promise<void>;
  movendo: boolean;
}

export default function CandidatoCard({ card, onMover, movendo }: Props) {
  const router = useRouter();
  const [responsavel, setResponsavel] = useState(card.responsavel ?? "");
  const [salvando, setSalvando] = useState(false);
  const [modalEtapa, setModalEtapa] = useState<EtapaOption | null>(null);
  const [comentario, setComentario] = useState("");
  const [analistas, setAnalistas] = useState<Analista[]>([]);

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
      if (!res.ok) setResponsavel(anterior);
    } catch {
      setResponsavel(anterior);
    } finally {
      setSalvando(false);
    }
  };

  const handleSelectChange = (value: string) => {
    if (value === "" || value === card.etapa) return;
    if (value === "contratado" || value === "reprovado_final") {
      onMover(card.cv_id, value);
      return;
    }
    const opcoes = OPCOES_POR_ETAPA[card.etapa] ?? [];
    const opcao = opcoes.find((o) => o.value === value);
    if (opcao) {
      setComentario("");
      setModalEtapa(opcao);
    }
  };

  const handleConfirmar = async () => {
    if (!modalEtapa) return;
    setModalEtapa(null);
    await onMover(card.cv_id, modalEtapa.value, comentario.trim() || undefined);
    setComentario("");
  };

  const handleCancelar = () => {
    setModalEtapa(null);
    setComentario("");
  };

  const etapaAtual = ETAPAS_KANBAN.find((e) => e.id === card.etapa) ??
    ETAPAS_KANBAN.find((e) => e.id === "entrevista_salmazos");
  const opcoes = OPCOES_POR_ETAPA[card.etapa] ?? [];

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
            </p>
            {card.triagem_score != null && card.triagem_label && (
              <div className="mt-0.5">
                <TriagemBadge score={card.triagem_score} label={card.triagem_label} size="sm" />
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
            <span className={card.origem && card.origem !== "Banco de talentos" ? "text-[#FFB800] font-medium" : ""}>
              {card.origem ?? "Banco de talentos"}
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

      {/* Comment Modal */}
      {modalEtapa && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleCancelar(); }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "24px 28px",
              width: 420,
              maxWidth: "90vw",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
              Mover para {modalEtapa.label}
            </h2>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 4px" }}>
              {card.nome_completo}
            </p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 16px" }}>
              Vaga: {card.vaga_titulo}
            </p>

            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
              Comentário
            </label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Adicione um comentário sobre esta movimentação..."
              rows={3}
              style={{
                width: "100%",
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: "#111827",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                marginBottom: 16,
              }}
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={handleCancelar}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid #E5E7EB",
                  background: "#fff",
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#FFB800",
                  color: "#000",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
