"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import ModalEditarVaga from "./ModalEditarVaga";
import ModalAdicionarCandidatoVaga from "./ModalAdicionarCandidatoVaga";
import ModalReprovacao from "./ModalReprovacao";
import MatchScoreBadge from "./MatchScoreBadge";
import { TIPOS_SERVICO } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { Vaga, CandidatoVaga, Candidato, MatchDetalhes } from "@/types";

const CORES_TIPO: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", color: "#ffffff" },
  mao_obra_temporaria:   { bg: "#FFD700", color: "#000000" },
  terceirizacao:         { bg: "#1D9E75", color: "#ffffff" },
  avaliacao_psicologica: { bg: "#6B4FBB", color: "#ffffff" },
};

const STATUS_VAGA: Record<string, { label: string; bg: string; color: string }> = {
  aberta:       { label: "Aberta",       bg: "#dcfce7", color: "#15803d" },
  em_andamento: { label: "Em andamento", bg: "#fef9c3", color: "#a16207" },
  fechada:      { label: "Fechada",      bg: "#f3f4f6", color: "#6b7280" },
  encerrada:    { label: "Encerrada",    bg: "#f3f4f6", color: "#6b7280" },
  cancelada:    { label: "Cancelada",    bg: "#fee2e2", color: "#dc2626" },
};

const ETAPAS_VAGA = [
  { id: "triagem",             label: "Triagem",             bg: "#1D6FA4", color: "#ffffff" },
  { id: "entrevista_salmazos", label: "Entrevista Salmazos", bg: "#FFD700", color: "#000000" },
  { id: "entrevista_cliente",  label: "Entrevista Cliente",  bg: "#F97316", color: "#ffffff" },
  { id: "aprovado",            label: "Aprovado",            bg: "#1D9E75", color: "#ffffff" },
  { id: "reprovado",           label: "Reprovado",           bg: "#EC4899", color: "#ffffff" },
] as const;

interface Props {
  vaga: Vaga;
  candidatosVaga: CandidatoVaga[];
}

export default function VagaDetalheClient({ vaga: inicial, candidatosVaga: inicialCv }: Props) {
  const [vaga, setVaga] = useState<Vaga>(inicial);
  const [candidatosVaga, setCandidatosVaga] = useState<CandidatoVaga[]>(inicialCv);
  const [modalEditar, setModalEditar]     = useState(false);
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [encerrando, setEncerrando]       = useState(false);
  const [vinculando, setVinculando]       = useState(false);
  const [vinculandoSalvando, setVinculandoSalvando] = useState(false);
  const [clientesLista, setClientesLista] = useState<{ id: string; nome: string }[]>([]);
  const [reprovacaoModal, setReprovacaoModal] = useState<{ open: boolean; candidatoId: string }>({ open: false, candidatoId: "" });
  const [reprovacaoCandidato, setReprovacaoCandidato] = useState<Candidato | null>(null);
  const [calculandoTodos, setCalculandoTodos] = useState(false);

  const candidatosOrdenados = useMemo(() => {
    return [...candidatosVaga].sort((a, b) => {
      const sa = a.match_score ?? -1;
      const sb = b.match_score ?? -1;
      return sb - sa;
    });
  }, [candidatosVaga]);

  const handleMatchCalculado = (cvId: string, score: number, detalhes: MatchDetalhes) => {
    setCandidatosVaga((prev) =>
      prev.map((cv) => (cv.id === cvId ? { ...cv, match_score: score, match_detalhes: detalhes } : cv))
    );
  };

  const refreshCandidatos = async () => {
    const res = await fetch(`/api/vagas/${vaga.id}/candidatos`);
    if (res.ok) {
      const { data } = await res.json();
      if (data) setCandidatosVaga(data as CandidatoVaga[]);
    }
  };

  const calcularMatchTodos = async () => {
    setCalculandoTodos(true);
    try {
      const res = await fetch(`/api/vagas/${vaga.id}/match-all`, { method: "POST" });
      if (res.ok) {
        const { results } = await res.json();
        setCandidatosVaga((prev) =>
          prev.map((cv) => {
            const r = results.find((x: { candidato_id: string }) => x.candidato_id === cv.candidato_id);
            if (r) return { ...cv, match_score: r.score, match_detalhes: r.detalhes };
            return cv;
          })
        );
      }
    } finally {
      setCalculandoTodos(false);
    }
  };

  const statusInfo = STATUS_VAGA[vaga.status] ?? STATUS_VAGA.aberta;
  const tipoInfo   = TIPOS_SERVICO.find((t) => t.id === vaga.tipo_servico);
  const coresTipo  = vaga.tipo_servico ? CORES_TIPO[vaga.tipo_servico] : null;

  const handleEncerrar = async () => {
    if (!confirm("Encerrar esta vaga?")) return;
    setEncerrando(true);
    const res = await fetch(`/api/vagas/${vaga.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "fechada" }),
    });
    if (res.ok) {
      const json = await res.json();
      setVaga(json.data);
    }
    setEncerrando(false);
  };

  const abrirVincular = async () => {
    setVinculando(true);
    if (clientesLista.length === 0) {
      const res = await fetch("/api/clientes");
      if (res.ok) {
        const json = await res.json();
        setClientesLista(
          (json.data ?? []).filter((c: { ativo: boolean }) => c.ativo)
        );
      }
    }
  };

  const handleVincularCliente = async (clienteId: string) => {
    setVinculandoSalvando(true);
    const res = await fetch(`/api/vagas/${vaga.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: clienteId }),
    });
    if (res.ok) {
      const json = await res.json();
      setVaga(json.data);
    }
    setVinculando(false);
    setVinculandoSalvando(false);
  };

  const handleReprovacaoNeeded = async (candidatoId: string) => {
    const res = await fetch(`/api/candidatos/${candidatoId}`);
    if (res.ok) {
      const json = await res.json();
      setReprovacaoCandidato(json.data);
      setReprovacaoModal({ open: true, candidatoId });
    }
  };

  const handleRemoverCandidato = async (cvId: string) => {
    if (!confirm("Remover candidato desta vaga?")) return;
    const res = await fetch("/api/candidatos-vagas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cvId }),
    });
    if (res.ok) setCandidatosVaga((prev) => prev.filter((cv) => cv.id !== cvId));
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <Link
        href="/painel/vagas"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition-colors mb-5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar às vagas
      </Link>

      {/* Header card */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vaga.titulo}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
              >
                {statusInfo.label}
              </span>
              {coresTipo && tipoInfo && (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: coresTipo.bg, color: coresTipo.color }}
                >
                  {tipoInfo.label}
                </span>
              )}
              {vaga.clientes && (
                <span className="text-xs bg-black/5 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                  {vaga.clientes.nome}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModalEditar(true)}
              className="btn-outline text-sm"
            >
              Editar
            </button>
            {vaga.status !== "fechada" && vaga.status !== "cancelada" && (
              <button
                onClick={handleEncerrar}
                disabled={encerrando}
                className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {encerrando ? "Encerrando..." : "Encerrar vaga"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-3 gap-6 items-start">

        {/* LEFT — 2/3 */}
        <div className="col-span-2 space-y-4">

          {/* Detalhes */}
          <div className="card">
            <p className="section-title mb-4">Detalhes da Vaga</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <DetalheItem label="Cliente">
                {vaga.clientes ? (
                  vaga.clientes.nome
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={!vaga.cliente_nome_temp ? "italic text-gray-400" : ""}>
                        {vaga.cliente_nome_temp || "Banco de Talentos"}
                      </span>
                      {vaga.cliente_nome_temp && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                        >
                          Sem vínculo
                        </span>
                      )}
                    </div>
                    {vinculando ? (
                      <div className="flex items-center gap-2">
                        <select
                          autoFocus
                          onChange={(e) => e.target.value && handleVincularCliente(e.target.value)}
                          disabled={vinculandoSalvando}
                          className="input-field text-xs py-1 h-7 flex-1 max-w-[200px]"
                        >
                          <option value="">Selecionar cliente...</option>
                          {clientesLista.map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setVinculando(false)}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={abrirVincular}
                        className="text-xs font-medium transition-colors"
                        style={{ color: "#1D6FA4" }}
                      >
                        Vincular cliente →
                      </button>
                    )}
                  </div>
                )}
              </DetalheItem>
              <DetalheItem label="Responsável">{vaga.responsavel || "—"}</DetalheItem>
              <DetalheItem label="Local">
                {[vaga.cidade, vaga.estado].filter(Boolean).join(" / ") || "—"}
              </DetalheItem>
              <DetalheItem label="Nº de posições">{String(vaga.num_posicoes)}</DetalheItem>
              {vaga.prazo && (
                <DetalheItem label="Prazo">{formatarData(vaga.prazo)}</DetalheItem>
              )}
              {vaga.salario && (
                <DetalheItem label="Salário">{vaga.salario}</DetalheItem>
              )}
              {vaga.horario && (
                <DetalheItem label="Horário" fullWidth>{vaga.horario}</DetalheItem>
              )}
            </dl>
          </div>

          {/* Requisitos */}
          {vaga.requisitos && (
            <div className="card">
              <p className="section-title mb-3">Requisitos</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {vaga.requisitos}
              </p>
            </div>
          )}

          {/* Benefícios */}
          {vaga.beneficios && (
            <div className="card">
              <p className="section-title mb-3">Benefícios</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {vaga.beneficios}
              </p>
            </div>
          )}

          {/* Observações */}
          {vaga.observacoes && (
            <div className="card">
              <p className="section-title mb-3">Observações internas</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {vaga.observacoes}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — 1/3 */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-title">Candidatos</p>
                <p className="text-2xl font-bold text-[#FFD700] mt-0.5">
                  {candidatosVaga.length}
                  <span className="text-xs font-normal text-gray-400 ml-1">
                    / {vaga.num_posicoes} {vaga.num_posicoes === 1 ? "posição" : "posições"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setModalAdicionar(true)}
                className="btn-primary text-xs px-3 py-1.5"
              >
                + Adicionar
              </button>
            </div>

            {candidatosVaga.length > 0 && (
              <button
                onClick={calcularMatchTodos}
                disabled={calculandoTodos}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl mb-3 transition-all disabled:opacity-50"
                style={{ backgroundColor: calculandoTodos ? "#e5e7eb" : "#000", color: calculandoTodos ? "#6b7280" : "#FFD700" }}
              >
                {calculandoTodos ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Calculando match IA...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Calcular Match IA para Todos
                  </>
                )}
              </button>
            )}

            {candidatosVaga.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                Nenhum candidato vinculado
              </p>
            ) : (
              <ul className="space-y-3">
                {candidatosOrdenados.map((cv) => (
                  <CandidatoVagaRow
                    key={cv.id}
                    cv={cv}
                    vagaId={vaga.id}
                    onRemover={() => handleRemoverCandidato(cv.id)}
                    onReprovacaoNeeded={handleReprovacaoNeeded}
                    onMatchCalculado={handleMatchCalculado}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Modal editar */}
      <ModalEditarVaga
        isOpen={modalEditar}
        vaga={vaga}
        onClose={() => setModalEditar(false)}
        onSalvo={(atualizada) => setVaga(atualizada)}
      />

      {/* Modal reprovação */}
      {reprovacaoCandidato && (
        <ModalReprovacao
          isOpen={reprovacaoModal.open}
          candidato={reprovacaoCandidato}
          onClose={() => {
            setReprovacaoModal({ open: false, candidatoId: "" });
            setReprovacaoCandidato(null);
          }}
          onReprovado={() => {
            setReprovacaoModal({ open: false, candidatoId: "" });
            setReprovacaoCandidato(null);
          }}
        />
      )}

      {/* Modal adicionar candidato */}
      <ModalAdicionarCandidatoVaga
        isOpen={modalAdicionar}
        vagaId={vaga.id}
        candidatosVinculadosIds={candidatosVaga.map((cv) => cv.candidato_id)}
        onClose={() => setModalAdicionar(false)}
        onAdicionado={(cv) => {
          setCandidatosVaga((prev) => [cv, ...prev]);
          setTimeout(refreshCandidatos, 4000);
        }}
      />
    </div>
  );
}

function DetalheItem({
  label,
  children,
  fullWidth = false,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-gray-800">{children}</dd>
    </div>
  );
}

function CandidatoVagaRow({
  cv,
  vagaId,
  onRemover,
  onReprovacaoNeeded,
  onMatchCalculado,
}: {
  cv: CandidatoVaga;
  vagaId: string;
  onRemover: () => void;
  onReprovacaoNeeded: (candidatoId: string) => void;
  onMatchCalculado: (cvId: string, score: number, detalhes: MatchDetalhes) => void;
}) {
  const c = cv.candidatos;
  const [etapa, setEtapa] = useState(cv.etapa ?? "triagem");
  const [salvando, setSalvando] = useState(false);
  const [calculandoMatch, setCalculandoMatch] = useState(false);
  const [tooltipVisivel, setTooltipVisivel] = useState(false);

  const etapaInfo = ETAPAS_VAGA.find((e) => e.id === etapa) ?? ETAPAS_VAGA[0];

  const handleEtapaChange = async (novaEtapa: string) => {
    setSalvando(true);
    const res = await fetch(`/api/candidatos-vagas/${cv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapa: novaEtapa }),
    });
    if (res.ok) {
      setEtapa(novaEtapa);
      const json = await res.json();
      if (json.showReprovacaoModal && json.candidatoId) {
        onReprovacaoNeeded(json.candidatoId);
      }
    }
    setSalvando(false);
  };

  const handleCalcularMatch = async () => {
    if (!cv.candidato_id) return;
    setCalculandoMatch(true);
    try {
      const res = await fetch(`/api/vagas/${vagaId}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidato_id: cv.candidato_id }),
      });
      if (res.ok) {
        const json = await res.json();
        onMatchCalculado(cv.id, json.score, json.detalhes);
      }
    } finally {
      setCalculandoMatch(false);
    }
  };

  return (
    <li className="flex items-start gap-3 py-1">
      <div className="w-8 h-8 rounded-full bg-black text-[#FFD700] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        {c ? c.nome_completo.charAt(0).toUpperCase() : "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {c?.nome_completo ?? "Candidato removido"}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <select
            value={etapa}
            onChange={(e) => handleEtapaChange(e.target.value)}
            disabled={salvando}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer disabled:opacity-60"
            style={{
              backgroundColor: etapaInfo.bg,
              color: etapaInfo.color,
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            {ETAPAS_VAGA.map((e) => (
              <option key={e.id} value={e.id} style={{ backgroundColor: "#fff", color: "#111" }}>
                {e.label}
              </option>
            ))}
          </select>
          {c?.responsavel && (
            <span className="text-[10px] text-gray-400">{c.responsavel}</span>
          )}
        </div>

        {/* Match score row */}
        <div className="mt-1.5">
          {cv.match_score != null ? (
            <div
              className="relative inline-block"
              onMouseEnter={() => setTooltipVisivel(true)}
              onMouseLeave={() => setTooltipVisivel(false)}
            >
              <MatchScoreBadge score={cv.match_score} size="md" />
              {tooltipVisivel && cv.match_detalhes && (
                <div
                  className="absolute bottom-full left-0 mb-1.5 z-20 rounded-xl shadow-xl border border-gray-100"
                  style={{ backgroundColor: "#fff", width: "220px", padding: "10px 12px" }}
                >
                  <p className="text-[10px] text-gray-500 mb-2 leading-snug">
                    {cv.match_detalhes.resumo}
                  </p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Cargo", value: cv.match_detalhes.cargo_match },
                      { label: "Habilidades", value: cv.match_detalhes.habilidades_match },
                      { label: "Localização", value: cv.match_detalhes.localizacao_match },
                      { label: "Experiência", value: cv.match_detalhes.experiencia_match },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-20 shrink-0">{label}</span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#f3f4f6" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${value}%`,
                              backgroundColor: value >= 80 ? "#22c55e" : value >= 60 ? "#FFD700" : value >= 40 ? "#f97316" : "#9ca3af",
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-gray-700 w-8 text-right">{value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleCalcularMatch}
              disabled={calculandoMatch}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all disabled:opacity-50"
              style={{ backgroundColor: "#f3f4f6", color: "#374151" }}
            >
              {calculandoMatch ? (
                <>
                  <svg className="animate-spin w-2.5 h-2.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Calculando...
                </>
              ) : (
                <>⚡ Match IA</>
              )}
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        {c && (
          <Link
            href={`/painel/candidato/${c.id}`}
            className="text-xs text-[#1D6FA4] hover:underline"
          >
            Ver perfil
          </Link>
        )}
        <button
          onClick={onRemover}
          className="text-gray-300 hover:text-red-400 transition-colors"
          title="Remover"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </li>
  );
}
