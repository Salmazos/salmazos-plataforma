"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import ModalEditarVaga from "./ModalEditarVaga";
import ModalAdicionarCandidatoVaga from "./ModalAdicionarCandidatoVaga";
import ModalReprovacao from "./ModalReprovacao";
import MatchScoreBadge from "./MatchScoreBadge";
import RetencaoBadge from "./RetencaoBadge";
import { TIPOS_SERVICO } from "@/lib/constants";
import { formatarData } from "@/lib/utils";
import type { Vaga, CandidatoVaga, Candidato, MatchDetalhes } from "@/types";

type HistoricoModalidade = {
  id: string;
  tipo_anterior: string;
  tipo_novo: string;
  alterado_por: string | null;
  motivo: string | null;
  created_at: string;
};

function formatarSalario(valor: string | null | undefined): string {
  if (!valor) return "A combinar";
  const trimmed = valor.trim();
  if (trimmed.startsWith("R$")) return trimmed;
  if (trimmed.toLowerCase() === "a combinar") return "A combinar";
  const num = parseFloat(trimmed.replace(",", "."));
  if (isNaN(num)) return trimmed;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CORES_TIPO: Record<string, { bg: string; color: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", color: "#ffffff" },
  mao_obra_temporaria:   { bg: "#FFD700", color: "#000000" },
  terceirizacao:         { bg: "#1D9E75", color: "#ffffff" },
  avaliacao_psicologica: { bg: "#6B4FBB", color: "#ffffff" },
};

const STATUS_VAGA: Record<string, { label: string; bg: string; color: string }> = {
  aberta:    { label: "Aberta",    bg: "#dcfce7", color: "#22c55e" },
  fechada:   { label: "Fechada",   bg: "#f3f4f6", color: "#6b7280" },
  cancelada: { label: "Cancelada", bg: "#fee2e2", color: "#ef4444" },
};

const ETAPAS_VAGA = [
  { id: "triagem",             label: "Triagem",             bg: "#1D6FA4", color: "#ffffff" },
  { id: "entrevista_salmazos", label: "Entrevista Salmazos", bg: "#FFD700", color: "#000000" },
  { id: "entrevista_cliente",  label: "Entrevista Cliente",   bg: "#F97316", color: "#ffffff" },
  { id: "aprovado_cliente",    label: "Aprovado pelo Cliente", bg: "#16a34a", color: "#ffffff" },
  { id: "aprovado",            label: "Aprovado",             bg: "#1D9E75", color: "#ffffff" },
  { id: "reprovado",           label: "Reprovado",           bg: "#EC4899", color: "#ffffff" },
] as const;

interface Props {
  vaga: Vaga;
  candidatosVaga: CandidatoVaga[];
}

export default function VagaDetalheClient({ vaga: inicial, candidatosVaga: inicialCv }: Props) {
  useAutoRefresh(30000);
  const [vaga, setVaga] = useState<Vaga>(inicial);
  const [candidatosVaga, setCandidatosVaga] = useState<CandidatoVaga[]>(inicialCv);
  const [modalEditar, setModalEditar]     = useState(false);
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [modalEncerrar, setModalEncerrar] = useState(false);
  const [modalAtivar, setModalAtivar]     = useState(false);
  const [encerrando, setEncerrando]       = useState(false);
  const [vinculando, setVinculando]       = useState(false);
  const [vinculandoSalvando, setVinculandoSalvando] = useState(false);
  const [clientesLista, setClientesLista] = useState<{ id: string; nome: string }[]>([]);
  const [reprovacaoModal, setReprovacaoModal] = useState<{ open: boolean; candidatoId: string }>({ open: false, candidatoId: "" });
  const [reprovacaoCandidato, setReprovacaoCandidato] = useState<Candidato | null>(null);
  const [calculandoTodos, setCalculandoTodos] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [historicoModalidade, setHistoricoModalidade] = useState<HistoricoModalidade[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const tipoLabel = useCallback((id: string) => TIPOS_SERVICO.find((t) => t.id === id)?.label ?? id, []);

  useEffect(() => {
    if (!vaga.tipo_servico_original || vaga.tipo_servico_original === vaga.tipo_servico) return;
    fetch(`/api/vagas/${vaga.id}/historico-modalidade`)
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((j) => setHistoricoModalidade(j.data ?? []))
      .catch(() => {});
  }, [vaga.id, vaga.tipo_servico_original, vaga.tipo_servico]);

  const handleCompartilhar = () => {
    const url = window.location.origin + "/vagas/" + vaga.id;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    });
  };

  const handleGerarPDF = async () => {
    setGerandoPDF(true);
    try {
      const res = await fetch(`/api/vagas/${vaga.id}/relatorio-pdf`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${vaga.titulo.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setGerandoPDF(false);
    }
  };

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

  const handleRetencaoCalculada = (cvId: string, score: number, label: string, resumo: string) => {
    setCandidatosVaga((prev) =>
      prev.map((cv) =>
        cv.id === cvId ? { ...cv, retencao_score: score, retencao_label: label, retencao_resumo: resumo } : cv
      )
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

  const handleEncerrarConfirm = async (status: "fechada" | "cancelada") => {
    setEncerrando(true);
    const res = await fetch(`/api/vagas/${vaga.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const json = await res.json();
      setVaga(json.data);
    }
    setEncerrando(false);
    setModalEncerrar(false);
  };

  const handleAtivarConfirm = async () => {
    setEncerrando(true);
    const res = await fetch(`/api/vagas/${vaga.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "aberta" }),
    });
    if (res.ok) {
      const json = await res.json();
      setVaga(json.data);
    }
    setEncerrando(false);
    setModalAtivar(false);
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
              onClick={handleCompartilhar}
              className="text-sm px-3 py-2 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: linkCopiado ? "#16a34a" : "#f3f4f6", color: linkCopiado ? "#fff" : "#374151" }}
            >
              {linkCopiado ? "✓ Link copiado!" : "🔗 Compartilhar"}
            </button>
            <button
              onClick={handleGerarPDF}
              disabled={gerandoPDF}
              className="text-sm px-3 py-2 rounded-lg font-semibold transition-colors disabled:opacity-60"
              style={{ backgroundColor: "#000", color: "#FFD700" }}
            >
              {gerandoPDF ? "Gerando..." : "📄 Gerar PDF"}
            </button>
            <button
              onClick={() => setModalEditar(true)}
              className="btn-outline text-sm"
            >
              Editar
            </button>
            {vaga.status !== "fechada" && vaga.status !== "cancelada" ? (
              <button
                onClick={() => setModalEncerrar(true)}
                className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Encerrar vaga
              </button>
            ) : (
              <button
                onClick={() => setModalAtivar(true)}
                className="text-sm px-3 py-2 rounded-lg font-semibold transition-colors"
                style={{ backgroundColor: "#dcfce7", color: "#15803d" }}
              >
                Ativar vaga
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modalidade change banner */}
      {vaga.tipo_servico_original && vaga.tipo_servico_original !== vaga.tipo_servico && (
        <div className="mb-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-800">
              {"🔄"} Modalidade alterada de{" "}
              <strong>{tipoLabel(vaga.tipo_servico_original)}</strong> para{" "}
              <strong>{tipoLabel(vaga.tipo_servico)}</strong>
              {vaga.tipo_servico_alterado_em && (
                <> em {new Date(vaga.tipo_servico_alterado_em).toLocaleDateString("pt-BR")}</>
              )}
              {vaga.tipo_servico_alterado_por && (
                <> por {vaga.tipo_servico_alterado_por}</>
              )}
              {vaga.tipo_servico_motivo && (
                <>. Motivo: {vaga.tipo_servico_motivo}</>
              )}
            </p>
            {historicoModalidade.length > 1 && (
              <div className="mt-2">
                <button
                  onClick={() => setHistoricoAberto((v) => !v)}
                  className="text-xs text-amber-700 underline underline-offset-2 cursor-pointer"
                >
                  {historicoAberto ? "Ocultar histórico" : `Ver histórico de modalidade (${historicoModalidade.length})`}
                </button>
                {historicoAberto && (
                  <div className="mt-2 space-y-1.5">
                    {historicoModalidade.map((h) => (
                      <div key={h.id} className="text-xs text-amber-700 bg-amber-100/50 rounded-lg px-3 py-2">
                        <span className="font-semibold">{tipoLabel(h.tipo_anterior)}</span>
                        {" → "}
                        <span className="font-semibold">{tipoLabel(h.tipo_novo)}</span>
                        {h.alterado_por && <> — {h.alterado_por}</>}
                        <span className="text-amber-500 ml-2">
                          {new Date(h.created_at).toLocaleDateString("pt-BR")}
                        </span>
                        {h.motivo && <div className="mt-0.5 text-amber-600">Motivo: {h.motivo}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                <DetalheItem label="Salário">{formatarSalario(vaga.salario)}</DetalheItem>
              )}
              {vaga.horario && (
                <DetalheItem label="Horário" fullWidth>{vaga.horario}</DetalheItem>
              )}
              {vaga.data_abertura && (
                <DetalheItem label="Data de Abertura">
                  {new Date(vaga.data_abertura).toLocaleDateString("pt-BR")}
                </DetalheItem>
              )}
              {(vaga.status === "fechada" || vaga.status === "cancelada") && vaga.data_fechamento && (
                <>
                  <DetalheItem label="Data de Fechamento">
                    {new Date(vaga.data_fechamento).toLocaleDateString("pt-BR")}
                  </DetalheItem>
                  {vaga.data_abertura && (
                    <DetalheItem label="Tempo aberta">
                      {Math.round((new Date(vaga.data_fechamento).getTime() - new Date(vaga.data_abertura).getTime()) / 86400000)} dias
                    </DetalheItem>
                  )}
                </>
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
                    onRetencaoCalculada={handleRetencaoCalculada}
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

      {/* Modal encerrar vaga */}
      {modalEncerrar && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}
          onClick={() => !encerrando && setModalEncerrar(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", width: "100%", maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: "20px" }}>
                <div>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>Encerrar vaga</h2>
                  <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>Selecione o motivo do encerramento:</p>
                </div>
                <button
                  onClick={() => setModalEncerrar(false)}
                  disabled={encerrando}
                  style={{ color: "#9ca3af", cursor: "pointer", background: "none", border: "none", padding: "4px" }}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {/* Cancelada */}
                <button
                  onClick={() => handleEncerrarConfirm("cancelada")}
                  disabled={encerrando}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
                    padding: "20px 16px", borderRadius: "12px", border: "1px solid #fecaca",
                    backgroundColor: "#fef2f2", cursor: encerrando ? "not-allowed" : "pointer",
                    opacity: encerrando ? 0.6 : 1, transition: "all 0.15s",
                  }}
                >
                  <svg width="28" height="28" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#dc2626" }}>Cancelada</span>
                  <span style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "1.4" }}>
                    Cliente cancelou a vaga
                  </span>
                </button>

                {/* Fechada */}
                <button
                  onClick={() => handleEncerrarConfirm("fechada")}
                  disabled={encerrando}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
                    padding: "20px 16px", borderRadius: "12px", border: "1px solid #e5e7eb",
                    backgroundColor: "#f9fafb", cursor: encerrando ? "not-allowed" : "pointer",
                    opacity: encerrando ? 0.6 : 1, transition: "all 0.15s",
                  }}
                >
                  <svg width="28" height="28" fill="none" stroke="#6b7280" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#374151" }}>Fechada</span>
                  <span style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "1.4" }}>
                    Vaga encerrada com sucesso pela Salmazos
                  </span>
                </button>
              </div>

              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <button
                  onClick={() => setModalEncerrar(false)}
                  disabled={encerrando}
                  style={{ fontSize: "13px", color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ativar vaga */}
      {modalAtivar && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}
          onClick={() => !encerrando && setModalAtivar(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", width: "100%", maxWidth: "400px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111827" }}>Reativar vaga</h2>
                <button
                  onClick={() => setModalAtivar(false)}
                  disabled={encerrando}
                  style={{ color: "#9ca3af", cursor: "pointer", background: "none", border: "none", padding: "4px" }}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "20px", lineHeight: "1.5" }}>
                Reativar esta vaga? Ela voltará para o status Aberta.
              </p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setModalAtivar(false)}
                  disabled={encerrando}
                  style={{
                    fontSize: "14px", padding: "8px 16px", borderRadius: "8px",
                    border: "1px solid #e5e7eb", backgroundColor: "#fff", color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAtivarConfirm}
                  disabled={encerrando}
                  style={{
                    fontSize: "14px", fontWeight: 600, padding: "8px 16px", borderRadius: "8px",
                    border: "none", backgroundColor: "#22c55e", color: "#fff",
                    cursor: encerrando ? "not-allowed" : "pointer",
                    opacity: encerrando ? 0.6 : 1,
                  }}
                >
                  {encerrando ? "Ativando..." : "Ativar vaga"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  onRetencaoCalculada,
}: {
  cv: CandidatoVaga;
  vagaId: string;
  onRemover: () => void;
  onReprovacaoNeeded: (candidatoId: string) => void;
  onMatchCalculado: (cvId: string, score: number, detalhes: MatchDetalhes) => void;
  onRetencaoCalculada: (cvId: string, score: number, label: string, resumo: string) => void;
}) {
  const c = cv.candidatos;
  const [etapa, setEtapa] = useState(cv.etapa ?? "triagem");
  const [salvando, setSalvando] = useState(false);
  const [calculandoMatch, setCalculandoMatch] = useState(false);
  const [tooltipVisivel, setTooltipVisivel] = useState(false);
  const [calculandoRetencao, setCalculandoRetencao] = useState(false);
  const [tooltipRetencaoVisivel, setTooltipRetencaoVisivel] = useState(false);

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

  const handleCalcularRetencao = async () => {
    setCalculandoRetencao(true);
    try {
      const res = await fetch(`/api/candidatos-vagas/${cv.id}/retencao`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        onRetencaoCalculada(cv.id, json.score, json.label, json.resumo);
      }
    } finally {
      setCalculandoRetencao(false);
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

        {/* Scores row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* Match score */}
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

          {/* Retention score */}
          {cv.retencao_score != null && cv.retencao_label ? (
            <div
              className="relative inline-block"
              onMouseEnter={() => setTooltipRetencaoVisivel(true)}
              onMouseLeave={() => setTooltipRetencaoVisivel(false)}
            >
              <RetencaoBadge score={cv.retencao_score} label={cv.retencao_label} size="md" />
              {tooltipRetencaoVisivel && cv.retencao_resumo && (
                <div
                  className="absolute bottom-full left-0 mb-1.5 z-20 rounded-xl shadow-xl border border-gray-100"
                  style={{ backgroundColor: "#fff", width: "200px", padding: "10px 12px" }}
                >
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">
                    Retenção IA
                  </p>
                  <p className="text-[10px] text-gray-600 leading-snug">{cv.retencao_resumo}</p>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleCalcularRetencao}
              disabled={calculandoRetencao}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all disabled:opacity-50"
              style={{ backgroundColor: "#f3f4f6", color: "#374151" }}
            >
              {calculandoRetencao ? (
                <>
                  <svg className="animate-spin w-2.5 h-2.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Calculando...
                </>
              ) : (
                <>🔒 Retenção IA</>
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
