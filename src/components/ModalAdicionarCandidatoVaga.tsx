"use client";

import { useState, useEffect, useRef } from "react";
import { ETAPAS_KANBAN } from "@/lib/constants";
import type { CandidatoVaga } from "@/types";

interface CandidatoBusca {
  id: string;
  nome_completo: string;
  cargo_pretendido: string;
  cidade: string | null;
  estado: string | null;
  origem: string | null;
  etapa_kanban: string;
  responsavel: string | null;
}

interface Props {
  isOpen: boolean;
  vagaId: string;
  candidatosVinculadosIds: string[];
  onClose: () => void;
  onAdicionado: (cv: CandidatoVaga) => void;
}

export default function ModalAdicionarCandidatoVaga({
  isOpen,
  vagaId,
  candidatosVinculadosIds,
  onClose,
  onAdicionado,
}: Props) {
  const [busca, setBusca]             = useState("");
  const [resultados, setResultados]   = useState<CandidatoBusca[]>([]);
  const [carregando, setCarregando]   = useState(false);
  const [adicionando, setAdicionando] = useState<string | null>(null);
  const [erro, setErro]               = useState("");
  const [sucesso, setSucesso]         = useState("");
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch on open (empty search shows first 30 active candidates)
  useEffect(() => {
    if (!isOpen) return;
    setBusca("");
    setErro("");
    setSucesso("");
    fetchCandidatos("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCandidatos(busca), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  async function fetchCandidatos(termo: string) {
    setCarregando(true);
    const params = new URLSearchParams({ status: "ativo" });
    if (termo.trim()) params.set("busca", termo.trim());
    const res = await fetch(`/api/candidatos?${params}`);
    if (res.ok) {
      const json = await res.json();
      setResultados(json.data ?? []);
    }
    setCarregando(false);
  }

  const handleAdicionar = async (candidato: CandidatoBusca) => {
    setAdicionando(candidato.id);
    setErro("");
    setSucesso("");
    const res = await fetch("/api/candidatos-vagas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaga_id: vagaId, candidato_id: candidato.id, etapa: "triagem" }),
    });
    const json = await res.json();
    setAdicionando(null);
    if (!res.ok) {
      setErro(json.error ?? "Erro ao adicionar.");
      return;
    }
    onAdicionado(json.data as CandidatoVaga);
    setSucesso(`${candidato.nome_completo} adicionado com sucesso.`);

    // Fire-and-forget match calculation — non-blocking
    fetch(`/api/vagas/${vagaId}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidato_id: candidato.id }),
    }).catch(() => {});

    setTimeout(onClose, 1200);
  };

  if (!isOpen) return null;

  const disponiveis = resultados.filter((c) => !candidatosVinculadosIds.includes(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[82vh] flex flex-col">

        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">Adicionar candidato à vaga</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b shrink-0">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              autoFocus
              type="text"
              placeholder="Buscar candidato por nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input-field pl-9"
            />
          </div>
        </div>

        {/* Feedback */}
        {(erro || sucesso) && (
          <div className={`mx-4 mt-3 shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium ${
            sucesso
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {sucesso || erro}
          </div>
        )}

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {carregando ? (
            <p className="text-sm text-gray-400 text-center py-8">Buscando...</p>
          ) : disponiveis.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {busca ? "Nenhum candidato encontrado" : "Nenhum candidato disponível"}
            </p>
          ) : (
            disponiveis.map((c) => {
              const etapa = ETAPAS_KANBAN.find((e) => e.id === c.etapa_kanban);
              const local = [c.cidade, c.estado].filter(Boolean).join(" / ");
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all"
                >
                  {/* Avatar + info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-black text-[#FFD700] flex items-center justify-center text-sm font-bold shrink-0">
                      {c.nome_completo.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.nome_completo}</p>
                      <p className="text-xs text-[#FFB800] font-medium truncate">{c.cargo_pretendido}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {local && (
                          <span className="text-[10px] text-gray-400">{local}</span>
                        )}
                        {c.origem && (
                          <span className="text-[10px] bg-black/5 text-gray-500 px-1.5 py-0.5 rounded-full">
                            {c.origem}
                          </span>
                        )}
                        {etapa && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: etapa.bgHex, color: etapa.textHex }}
                          >
                            {etapa.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add button */}
                  <button
                    onClick={() => handleAdicionar(c)}
                    disabled={!!adicionando}
                    className="btn-primary text-xs px-3 py-1.5 shrink-0 disabled:opacity-50"
                  >
                    {adicionando === c.id ? "..." : "Adicionar"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
