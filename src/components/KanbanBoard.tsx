"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ETAPAS_KANBAN, HABILIDADES } from "@/lib/constants";
import type { KanbanCard } from "@/types";
import CandidatoCard from "./CandidatoCard";
import ModalEncaminhamento from "./ModalEncaminhamento";
import ModalFinalizarProcesso from "./ModalFinalizarProcesso";
import type { FinalizarResult } from "./ModalFinalizarProcesso";

interface Props {
  cards: KanbanCard[];
  filtroOrigem?: string | null;
}

interface PendingEncaminhamento {
  cvId: string;
  candidatoId: string;
  candidatoNome: string;
  vagaId: string;
  vagaTitulo: string;
}

interface PendingFinalizar {
  cvId: string;
  candidatoNome: string;
  vagaTitulo: string;
  resultado: "contratado" | "reprovado_final";
}

const FORMACOES = [
  "Ensino Fundamental",
  "Ensino Médio",
  "Ensino Técnico",
  "Superior",
  "Cursando",
];

const EXPERIENCIAS = [
  { label: "Sem experiência", valores: ["Sem experiência"] },
  { label: "Até 1 ano",       valores: ["Menos de 1 ano"] },
  { label: "1 a 3 anos",      valores: ["1 a 2 anos"] },
  { label: "Mais de 3 anos",  valores: ["3 a 5 anos", "Mais de 5 anos"] },
];

const ORIGENS = ["Cadastro Rapido", "Banco de talentos", "Formulário público"];

const CHIP_ON:  React.CSSProperties = { backgroundColor: "#000", color: "#fff", border: "1.5px solid #000" };
const CHIP_OFF: React.CSSProperties = { backgroundColor: "#fff", color: "#374151", border: "1.5px solid #D1D5DB" };

// Map entrevista_salmazos to same column for display
const ETAPA_COLUMN_MAP: Record<string, string> = {
  entrevista_rh: "entrevista_salmazos",
  reprovado_cliente: "aprovado_cliente",
};

export default function KanbanBoard({ cards, filtroOrigem }: Props) {
  const router = useRouter();
  useAutoRefresh(30000);

  const [filtroCargo, setFiltroCargo] = useState("");
  const [movendo, setMovendo] = useState<string | null>(null);
  const [pendingEncaminhamento, setPendingEncaminhamento] =
    useState<PendingEncaminhamento | null>(null);
  const [pendingFinalizar, setPendingFinalizar] =
    useState<PendingFinalizar | null>(null);
  const [toast, setToast] = useState("");
  const [toastBg, setToastBg] = useState("#065F46");
  const [toastIcon, setToastIcon] = useState("✅");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtroKeyword, setFiltroKeyword]       = useState("");
  const [filtroCidade, setFiltroCidade]         = useState("");
  const [filtroFormacao, setFiltroFormacao]     = useState("");
  const [filtroExperiencia, setFiltroExperiencia] = useState("");
  const [filtroOrigemFonte, setFiltroOrigemFonte] = useState("");
  const [filtroHabilidades, setFiltroHabilidades] = useState<string[]>([]);

  const toggleHabilidade = (h: string) =>
    setFiltroHabilidades((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    );

  const limparFiltros = () => {
    setFiltroKeyword("");
    setFiltroCidade("");
    setFiltroFormacao("");
    setFiltroExperiencia("");
    setFiltroOrigemFonte("");
    setFiltroHabilidades([]);
  };

  const filtrosAtivos = [
    filtroKeyword,
    filtroCidade,
    filtroFormacao,
    filtroExperiencia,
    filtroOrigemFonte,
  ].filter(Boolean).length + filtroHabilidades.length;

  const filtrados = useMemo(() => {
    return cards.filter((c) => {
      if (filtroCargo && !c.cargo_pretendido.toLowerCase().includes(filtroCargo.toLowerCase())) return false;
      if (filtroOrigem && (c.origem ?? "Banco de talentos") !== filtroOrigem) return false;
      if (filtroKeyword) {
        const kw = filtroKeyword.toLowerCase();
        const haystack = [c.nome_completo, c.cargo_pretendido, c.vaga_titulo].join(" ").toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      if (filtroCidade && !c.cidade.toLowerCase().includes(filtroCidade.toLowerCase())) return false;
      if (filtroOrigemFonte && (c.origem ?? "Banco de talentos") !== filtroOrigemFonte) return false;
      return true;
    });
  }, [
    cards, filtroCargo, filtroOrigem,
    filtroKeyword, filtroCidade, filtroFormacao,
    filtroExperiencia, filtroOrigemFonte,
    filtroHabilidades,
  ]);

  const showToast = (msg: string, bg = "#065F46", icon = "✅") => {
    setToast(msg);
    setToastBg(bg);
    setToastIcon(icon);
    setTimeout(() => setToast(""), 5000);
  };

  const moverCard = async (cvId: string, novaEtapa: string, comentario?: string) => {
    if (novaEtapa === "entrevista_cliente") {
      const card = cards.find((c) => c.cv_id === cvId);
      setPendingEncaminhamento({
        cvId,
        candidatoId: card?.candidato_id ?? "",
        candidatoNome: card?.nome_completo ?? "",
        vagaId: card?.vaga_id ?? "",
        vagaTitulo: card?.vaga_titulo ?? "",
      });
      return;
    }

    if (novaEtapa === "contratado" || novaEtapa === "reprovado_final") {
      const card = cards.find((c) => c.cv_id === cvId);
      setPendingFinalizar({
        cvId,
        candidatoNome: card?.nome_completo ?? "",
        vagaTitulo: card?.vaga_titulo ?? "",
        resultado: novaEtapa as "contratado" | "reprovado_final",
      });
      return;
    }

    setMovendo(cvId);
    try {
      await fetch(`/api/candidatos-vagas/${cvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: novaEtapa, observacoes: comentario || null }),
      });

      if (novaEtapa === "bloqueado") {
        const card = cards.find((c) => c.cv_id === cvId);
        if (card) {
          await fetch(`/api/candidatos/${card.candidato_id}/etapa`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ etapa_kanban: "bloqueado", comentario: comentario || null }),
          });
        }
      }

      router.refresh();
    } finally {
      setMovendo(null);
    }
  };

  const handleConfirmarEncaminhamento = async (dados: {
    cliente_id: string;
    data_entrevista: string;
    tipo_servico: string;
    observacoes: string;
    vaga_id?: string;
  }) => {
    if (!pendingEncaminhamento) return;
    const { cvId, candidatoId } = pendingEncaminhamento;
    await fetch("/api/encaminhamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidato_id: candidatoId, ...dados }),
    });
    setMovendo(cvId);
    try {
      await fetch(`/api/candidatos-vagas/${cvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: "entrevista_cliente" }),
      });
      router.refresh();
      showToast("Entrevista agendada e candidato enviado para o painel do cliente");
    } finally {
      setMovendo(null);
    }
    setPendingEncaminhamento(null);
  };

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filtrar por cargo..."
            value={filtroCargo}
            onChange={(e) => setFiltroCargo(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {filtrados.length} candidato{filtrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Advanced filters */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setFiltrosAbertos((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-black transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filtros avançados
            <span className="text-[#FFB800] text-xs select-none">
              {filtrosAbertos ? "▼︎" : "▶︎"}
            </span>
            {filtrosAtivos > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "#000", color: "#FFD700" }}
              >
                {filtrosAtivos} {filtrosAtivos === 1 ? "filtro ativo" : "filtros ativos"}
              </span>
            )}
          </button>
          {filtrosAtivos > 0 && (
            <button onClick={limparFiltros} className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
              Limpar filtros
            </button>
          )}
        </div>

        {filtrosAbertos && (
          <div className="card space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Palavra-chave</label>
                <input type="text" placeholder="Nome, cargo, vaga..." value={filtroKeyword} onChange={(e) => setFiltroKeyword(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cidade</label>
                <input type="text" placeholder="Ex: São Paulo" value={filtroCidade} onChange={(e) => setFiltroCidade(e.target.value)} className="input-field" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Formação</label>
                <select value={filtroFormacao} onChange={(e) => setFiltroFormacao(e.target.value)} className="input-field">
                  <option value="">Todos</option>
                  {FORMACOES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Experiência</label>
                <select value={filtroExperiencia} onChange={(e) => setFiltroExperiencia(e.target.value)} className="input-field">
                  <option value="">Todos</option>
                  {EXPERIENCIAS.map((e) => <option key={e.label} value={e.label}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Origem</label>
                <select value={filtroOrigemFonte} onChange={(e) => setFiltroOrigemFonte(e.target.value)} className="input-field">
                  <option value="">Todos</option>
                  {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Habilidades</label>
              <div className="flex flex-wrap gap-1.5">
                {HABILIDADES.map((h) => {
                  const ativo = filtroHabilidades.includes(h);
                  return (
                    <button key={h} type="button" onClick={() => toggleHabilidade(h)} className="text-xs px-2.5 py-1 rounded-full font-medium transition-all" style={ativo ? CHIP_ON : CHIP_OFF}>
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-2 overflow-x-auto pb-6">
        {ETAPAS_KANBAN.map((etapa) => {
          const columnCards = filtrados.filter((c) => {
            const mapped = ETAPA_COLUMN_MAP[c.etapa] ?? c.etapa;
            return mapped === etapa.id;
          });
          return (
            <div key={etapa.id} className="flex-shrink-0 w-72">
              <div
                className={`border-t-4 ${etapa.topBorder} rounded-t-xl px-3 py-2.5 flex items-center justify-between`}
                style={{ backgroundColor: etapa.bgHex }}
              >
                <span className="font-bold text-sm tracking-wide" style={{ color: etapa.textHex }}>
                  {etapa.label}
                </span>
                <span className={`${etapa.badgeBg} ${etapa.badgeText} text-xs font-bold px-2 py-0.5 rounded-full`}>
                  {columnCards.length}
                </span>
              </div>
              <div
                className="rounded-b-xl min-h-[400px] p-1.5 space-y-1.5"
                style={{ backgroundColor: etapa.bgHex }}
              >
                {columnCards.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs pt-8">Nenhum candidato</p>
                ) : (
                  columnCards.map((c) => (
                    <CandidatoCard
                      key={c.cv_id}
                      card={c}
                      onMover={moverCard}
                      movendo={movendo === c.cv_id}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ModalFinalizarProcesso
        isOpen={!!pendingFinalizar}
        resultado={pendingFinalizar?.resultado ?? "contratado"}
        candidatoNome={pendingFinalizar?.candidatoNome ?? ""}
        vagaTitulo={pendingFinalizar?.vagaTitulo ?? ""}
        cvId={pendingFinalizar?.cvId ?? ""}
        onClose={() => setPendingFinalizar(null)}
        onConfirmar={(res: FinalizarResult) => {
          setPendingFinalizar(null);
          router.refresh();
          if (res.resultado === "contratado") {
            showToast(
              res.vaga_encerrada
                ? "Candidato contratado! Vaga encerrada — todas as posições preenchidas!"
                : "Candidato contratado! Vaga atualizada.",
              "#065F46",
              "🎉",
            );
          } else if (res.vaga_reaberta) {
            showToast(
              "Processo encerrado. Candidato retornou ao Banco. Vaga reaberta automaticamente.",
              "#92400E",
              "📋",
            );
          } else {
            showToast(
              "Processo encerrado. Candidato retornou ao Banco de Candidatos.",
              "#374151",
              "📋",
            );
          }
        }}
      />

      <ModalEncaminhamento
        isOpen={!!pendingEncaminhamento}
        candidatoId={pendingEncaminhamento?.candidatoId ?? ""}
        candidatoNome={pendingEncaminhamento?.candidatoNome ?? ""}
        vagaId={pendingEncaminhamento?.vagaId}
        vagaTitulo={pendingEncaminhamento?.vagaTitulo}
        onClose={() => setPendingEncaminhamento(null)}
        onConfirmar={handleConfirmarEncaminhamento}
      />

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: toastBg,
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 60,
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{toastIcon}</span> {toast}
        </div>
      )}
    </div>
  );
}
