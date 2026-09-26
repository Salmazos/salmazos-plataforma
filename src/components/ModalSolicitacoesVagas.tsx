"use client";

import { useState, useEffect } from "react";
import { mensagemDecisaoSolicitacao } from "@/lib/solicitacaoVagaStatus";
import { ROTULO_CAMPO_SOLICITACAO, valorLegivelCampo, type Alteracoes } from "@/lib/solicitacaoAlteracaoRotulos";
import { ROTULO_MOTIVO_ENCERRAMENTO, type MotivoTipoEncerramento } from "@/lib/vagaPausaReativacao";
import FormularioEdicaoSolicitacao, {
  corpoDoForm,
  formDeSolicitacao,
  type FormEdicaoSolicitacao,
} from "@/components/FormularioEdicaoSolicitacao";

const TIPO_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  recrutamento_selecao: { label: "R&S", bg: "#1D6FA4", color: "#fff" },
  mao_obra_temporaria:  { label: "MOT", bg: "#FFD700", color: "#000" },
  terceirizacao:        { label: "Terceirização", bg: "#1D9E75", color: "#fff" },
};

interface Solicitacao {
  id: string;
  cliente_nome: string;
  cargo: string;
  tipo_servico: string;
  num_posicoes: number;
  cidade: string | null;
  estado: string | null;
  salario: string | null;
  adicionais_salariais: string | null;
  horario_texto: string | null;
  previsao_inicio: string | null;
  requisitos: string | null;
  beneficios: string | null;
  beneficios_chips: Record<string, boolean> | null;
  principais_atividades: string | null;
  observacoes: string | null;
  confidencial: boolean;
  created_at: string;
  status: string;
  aprovada_por: string | null;
  aprovada_em: string | null;
  motivo_recusa: string | null;
  vaga_id: string | null;
  // Pedido de alteração que o cliente fez pelo portal, aguardando decisão da Salmazos.
  alteracao_pendente?: { id: string; alteracoes: Alteracoes; criado_em: string } | null;
  // Pedido de pausa ("encerramento") ou reabertura da vaga, aguardando decisão da Salmazos
  // (ver vagaPausaReativacao.ts) — indexado pela vaga, não pela solicitação.
  status_pendente?: {
    id: string;
    vaga_id: string;
    acao: "pausar" | "reabrir";
    motivo_tipo: MotivoTipoEncerramento | null;
    motivo_texto: string | null;
    criado_em: string;
  } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVagaCriada: () => void;
  focoId?: string | null;
  onVerTodas?: () => void;
}

export default function ModalSolicitacoesVagas({ isOpen, onClose, onVagaCriada, focoId, onVerTodas }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Solicitacao[]>([]);
  const [toast, setToast] = useState("");
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  const [expandedAtiv, setExpandedAtiv] = useState<string | null>(null);
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormEdicaoSolicitacao | null>(null);
  const [erroEdicao, setErroEdicao] = useState("");
  const [recusandoAlteracaoId, setRecusandoAlteracaoId] = useState<string | null>(null);
  const [motivoRecusaAlteracao, setMotivoRecusaAlteracao] = useState("");
  const [erroAlteracao, setErroAlteracao] = useState<{ id: string; msg: string } | null>(null);
  const [recusandoStatusId, setRecusandoStatusId] = useState<string | null>(null);
  const [motivoRecusaStatus, setMotivoRecusaStatus] = useState("");
  const [erroStatus, setErroStatus] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    if (focoId) {
      fetch(`/api/solicitacoes-vagas/${focoId}`)
        .then((r) => r.json())
        .then((json) => setItems(json.data ? [json.data] : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
      return;
    }
    fetch("/api/solicitacoes-vagas")
      .then((r) => r.json())
      .then((json) => setItems(json.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [isOpen, focoId]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const handleCriarVaga = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/vagas/from-solicitacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solicitacao_id: id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== id));
        showToast("Vaga criada com sucesso!");
        onVagaCriada();
        if (focoId) onVerTodas?.();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecusar = async (id: string) => {
    if (!motivoRecusa.trim()) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/solicitacoes-vagas/${id}/recusar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo_recusa: motivoRecusa.trim() }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== id));
        setRecusandoId(null);
        setMotivoRecusa("");
        showToast("Solicitação recusada.");
        if (focoId) onVerTodas?.();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const abrirEdicao = (s: Solicitacao) => {
    setRecusandoId(null);
    setEditandoId(s.id);
    setFormEdicao(formDeSolicitacao(s));
    setErroEdicao("");
  };

  const fecharEdicao = () => {
    setEditandoId(null);
    setFormEdicao(null);
    setErroEdicao("");
  };

  const handleSalvarEdicao = async (id: string) => {
    if (!formEdicao) return;
    if (!formEdicao.cargo.trim() || !formEdicao.cidade.trim()) {
      setErroEdicao("Cargo e cidade são obrigatórios.");
      return;
    }
    setActionLoading(id);
    setErroEdicao("");
    try {
      const res = await fetch(`/api/solicitacoes-vagas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDoForm(formEdicao)),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroEdicao(typeof json.error === "string" ? json.error : "Erro ao salvar.");
        return;
      }
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...json.data } : s)));
      fecharEdicao();
      showToast(json.vaga_atualizada ? "Solicitação e vaga atualizadas." : "Solicitação atualizada.");
      if (json.vaga_atualizada) onVagaCriada();
    } finally {
      setActionLoading(null);
    }
  };

  // Decisão sobre o pedido de alteração do cliente (ver POST /api/solicitacoes-vagas/[id]/alteracao).
  const handleDecidirAlteracao = async (s: Solicitacao, acao: "aprovar" | "recusar") => {
    if (acao === "recusar" && !motivoRecusaAlteracao.trim()) return;
    setActionLoading(s.id);
    setErroAlteracao(null);
    try {
      const res = await fetch(`/api/solicitacoes-vagas/${s.id}/alteracao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "aprovar" ? { acao } : { acao, motivo: motivoRecusaAlteracao.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroAlteracao({ id: s.id, msg: typeof json.error === "string" ? json.error : "Erro ao registrar a decisão." });
        return;
      }
      // Solicitação aprovada sem outra pendência sai da lista de pendentes depois da decisão.
      setItems((prev) =>
        prev
          .map((it) => (it.id === s.id ? { ...it, ...(json.data ?? {}), alteracao_pendente: null } : it))
          .filter((it) => focoId || it.status === "pendente" || it.alteracao_pendente || it.status_pendente)
      );
      setRecusandoAlteracaoId(null);
      setMotivoRecusaAlteracao("");
      showToast(
        acao === "aprovar"
          ? json.vaga_atualizada
            ? "Alterações aprovadas — solicitação e vaga atualizadas."
            : "Alterações aprovadas."
          : "Alterações recusadas. O cliente foi avisado."
      );
      if (json.vaga_atualizada) onVagaCriada();
    } finally {
      setActionLoading(null);
    }
  };

  // Decisão sobre o pedido de pausa/reabertura de vaga (ver POST
  // /api/vagas/[id]/solicitacao-status) — mesmo formato de handleDecidirAlteracao, mas
  // chaveado pela vaga (s.vaga_id), não pela solicitação.
  const handleDecidirStatus = async (s: Solicitacao, acao: "aprovar" | "recusar") => {
    if (!s.vaga_id) return;
    if (acao === "recusar" && !motivoRecusaStatus.trim()) return;
    setActionLoading(s.id);
    setErroStatus(null);
    try {
      const res = await fetch(`/api/vagas/${s.vaga_id}/solicitacao-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "aprovar" ? { acao } : { acao, motivo: motivoRecusaStatus.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroStatus({ id: s.id, msg: typeof json.error === "string" ? json.error : "Erro ao registrar a decisão." });
        return;
      }
      setItems((prev) =>
        prev
          .map((it) => (it.id === s.id ? { ...it, status_pendente: null } : it))
          .filter((it) => focoId || it.status === "pendente" || it.alteracao_pendente || it.status_pendente)
      );
      setRecusandoStatusId(null);
      setMotivoRecusaStatus("");
      const pausando = s.status_pendente?.acao !== "reabrir";
      showToast(
        acao === "aprovar"
          ? `Vaga ${pausando ? "encerrada" : "reativada"} com sucesso.`
          : `Pedido de ${pausando ? "encerramento" : "reativação"} recusado. O cliente foi avisado.`
      );
      if (acao === "aprovar") onVagaCriada();
    } finally {
      setActionLoading(null);
    }
  };

  const benChipsList = (chips: Record<string, boolean> | null) => {
    if (!chips) return [];
    return Object.entries(chips).filter(([, v]) => v).map(([k]) => k);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">
            {"📬"} {focoId ? "Solicitação de Vaga" : "Solicitações de Vagas Pendentes"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {focoId && (
            <button
              onClick={() => onVerTodas?.()}
              className="text-xs text-blue-600 underline underline-offset-2 mb-4"
            >
              ← ver todas as solicitações pendentes
            </button>
          )}

          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">Carregando...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-3">{focoId ? "🔍" : "🎉"}</p>
              <p className="text-gray-500 text-sm font-medium">
                {focoId ? "Solicitação não encontrada." : "Nenhuma solicitação pendente!"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((s) => {
                const tipo = TIPO_LABEL[s.tipo_servico] ?? { label: s.tipo_servico, bg: "#6B7280", color: "#fff" };
                const isRecusando = recusandoId === s.id;
                const isEditando = editandoId === s.id && formEdicao !== null;
                const isLoading = actionLoading === s.id;
                const jaDecidida = s.status !== "pendente";
                // Pendente ou aprovada podem ser editadas; aprovada propaga pra vaga (ver PATCH).
                const editavel = s.status === "pendente" || s.status === "aprovada";

                return (
                  <div key={s.id} className="border border-gray-200 rounded-xl p-5 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm">{s.cliente_nome}</span>
                      <span className="text-gray-300">—</span>
                      <span className="font-semibold text-gray-800 text-sm">{s.cargo}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: tipo.bg, color: tipo.color }}
                      >
                        {tipo.label}
                      </span>
                      {s.confidencial && (
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5" }}
                        >
                          🔴 CONFIDENCIAL
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {new Date(s.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{s.num_posicoes} posição{s.num_posicoes !== 1 ? "ões" : ""}</span>
                      {s.cidade && <span>{"📍"} {s.cidade}/{s.estado}</span>}
                      {s.previsao_inicio && (
                        <span>{"📅"} Previsão: {s.previsao_inicio.split("-").reverse().join("/")}</span>
                      )}
                      {s.salario && <span>{"💰"} {s.salario}</span>}
                      {s.adicionais_salariais && <span className="text-gray-400">+ {s.adicionais_salariais}</span>}
                    </div>

                    {s.horario_texto && (
                      <p className="text-xs text-gray-500">
                        {"🕐"} {s.horario_texto}
                      </p>
                    )}

                    {/* Requisitos (collapsible) */}
                    {s.requisitos && (
                      <div>
                        <button
                          onClick={() => setExpandedReq(expandedReq === s.id ? null : s.id)}
                          className="text-xs text-blue-600 underline underline-offset-2"
                        >
                          {expandedReq === s.id ? "Ocultar requisitos" : "Ver requisitos"}
                        </button>
                        {expandedReq === s.id && (
                          <pre className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3">
                            {s.requisitos}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Benefícios chips */}
                    {s.beneficios_chips && benChipsList(s.beneficios_chips).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {benChipsList(s.beneficios_chips).map((b) => (
                          <span key={b} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#DCFCE7", color: "#166534" }}>
                            {b}
                          </span>
                        ))}
                      </div>
                    )}

                    {s.principais_atividades && (
                      <div>
                        <button
                          onClick={() => setExpandedAtiv(expandedAtiv === s.id ? null : s.id)}
                          className="text-xs text-blue-600 underline underline-offset-2"
                        >
                          {expandedAtiv === s.id ? "Ocultar principais atividades" : "Ver principais atividades"}
                        </button>
                        {expandedAtiv === s.id && (
                          <pre className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3">
                            {s.principais_atividades}
                          </pre>
                        )}
                      </div>
                    )}

                    {s.observacoes && (
                      <p className="text-xs text-gray-500 italic">
                        {"💬"} {s.observacoes}
                      </p>
                    )}

                    {/* Pedido de alteração do cliente aguardando decisão */}
                    {s.alteracao_pendente && (
                      <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                        <p className="text-xs font-bold text-blue-900">
                          {"✏️"} O cliente pediu alterações em{" "}
                          {new Date(s.alteracao_pendente.criado_em).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                          {s.status === "aprovada" && s.vaga_id ? " — ao aprovar, a vaga também é atualizada" : ""}
                        </p>
                        <div className="space-y-1.5">
                          {Object.entries(s.alteracao_pendente.alteracoes).map(([campo, { antes, depois }]) => (
                            <div key={campo} className="text-xs">
                              <span className="font-semibold text-gray-700">{ROTULO_CAMPO_SOLICITACAO[campo] ?? campo}:</span>{" "}
                              <span className="text-gray-400 line-through whitespace-pre-wrap">{valorLegivelCampo(campo, antes)}</span>{" "}
                              <span className="text-gray-400">→</span>{" "}
                              <span className="text-gray-900 whitespace-pre-wrap">{valorLegivelCampo(campo, depois)}</span>
                            </div>
                          ))}
                        </div>

                        {erroAlteracao?.id === s.id && <p className="text-xs text-red-600">{erroAlteracao.msg}</p>}

                        {recusandoAlteracaoId === s.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={motivoRecusaAlteracao}
                              onChange={(e) => setMotivoRecusaAlteracao(e.target.value)}
                              placeholder="Motivo da recusa (vai no e-mail pro cliente)..."
                              rows={2}
                              className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none resize-none bg-white"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setRecusandoAlteracaoId(null); setMotivoRecusaAlteracao(""); }}
                                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleDecidirAlteracao(s, "recusar")}
                                disabled={!motivoRecusaAlteracao.trim() || isLoading}
                                className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                              >
                                {isLoading ? "Recusando..." : "Confirmar recusa"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setRecusandoAlteracaoId(s.id); setMotivoRecusaAlteracao(""); }}
                              disabled={isLoading}
                              className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 font-semibold bg-white hover:bg-red-50 disabled:opacity-50"
                            >
                              {"❌"} Recusar alterações
                            </button>
                            <button
                              onClick={() => handleDecidirAlteracao(s, "aprovar")}
                              disabled={isLoading}
                              className="text-xs px-4 py-1.5 rounded-lg font-bold disabled:opacity-50"
                              style={{ backgroundColor: "#1D4ED8", color: "#fff" }}
                            >
                              {isLoading ? "Aplicando..." : "✅ Aprovar alterações"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pedido de pausa ("encerramento") ou reabertura da vaga aguardando decisão */}
                    {s.status_pendente && (() => {
                      const pendente = s.status_pendente;
                      const pausando = pendente.acao !== "reabrir";
                      return (
                        <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: pausando ? "#FEF2F2" : "#EFF6FF", border: `1px solid ${pausando ? "#FCA5A5" : "#BFDBFE"}` }}>
                          <p className="text-xs font-bold" style={{ color: pausando ? "#991B1B" : "#1E3A8A" }}>
                            {pausando ? "⏸️" : "▶️"} O cliente pediu {pausando ? "o encerramento" : "a reativação"} desta vaga em{" "}
                            {new Date(pendente.criado_em).toLocaleString("pt-BR", {
                              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                          {pausando && pendente.motivo_tipo && (
                            <p className="text-xs text-gray-700">
                              <span className="font-semibold">Motivo:</span> {ROTULO_MOTIVO_ENCERRAMENTO[pendente.motivo_tipo]}
                            </p>
                          )}
                          {pendente.motivo_texto && (
                            <p className="text-xs text-gray-600 italic whitespace-pre-wrap">{"💬"} {pendente.motivo_texto}</p>
                          )}

                          {erroStatus?.id === s.id && <p className="text-xs text-red-600">{erroStatus.msg}</p>}

                          {recusandoStatusId === s.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={motivoRecusaStatus}
                                onChange={(e) => setMotivoRecusaStatus(e.target.value)}
                                placeholder="Motivo da recusa (vai no e-mail pro cliente)..."
                                rows={2}
                                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none resize-none bg-white"
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => { setRecusandoStatusId(null); setMotivoRecusaStatus(""); }}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleDecidirStatus(s, "recusar")}
                                  disabled={!motivoRecusaStatus.trim() || isLoading}
                                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                                >
                                  {isLoading ? "Recusando..." : "Confirmar recusa"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setRecusandoStatusId(s.id); setMotivoRecusaStatus(""); }}
                                disabled={isLoading}
                                className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 font-semibold bg-white hover:bg-red-50 disabled:opacity-50"
                              >
                                {"❌"} Recusar
                              </button>
                              <button
                                onClick={() => handleDecidirStatus(s, "aprovar")}
                                disabled={isLoading}
                                className="text-xs px-4 py-1.5 rounded-lg font-bold disabled:opacity-50"
                                style={{ backgroundColor: pausando ? "#DC2626" : "#16a34a", color: "#fff" }}
                              >
                                {isLoading ? "Aplicando..." : pausando ? "✅ Aprovar e encerrar" : "✅ Aprovar e reabrir"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Já decidida por outra pessoa */}
                    {jaDecidida && (
                      <div
                        className="rounded-lg p-3 text-xs font-medium"
                        style={{
                          backgroundColor: s.status === "aprovada" ? "#F0FDF4" : "#FEF2F2",
                          color: s.status === "aprovada" ? "#166534" : "#991B1B",
                          border: `1px solid ${s.status === "aprovada" ? "#BBF7D0" : "#FECACA"}`,
                        }}
                      >
                        {mensagemDecisaoSolicitacao(s)}
                      </div>
                    )}

                    {s.status === "aprovada" && !isEditando && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => abrirEdicao(s)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {"✏️"} Editar solicitação e vaga
                        </button>
                      </div>
                    )}

                    {/* Recusa inline */}
                    {!jaDecidida && isRecusando && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                        <label className="block text-xs font-semibold text-red-700">Motivo da recusa *</label>
                        <textarea
                          value={motivoRecusa}
                          onChange={(e) => setMotivoRecusa(e.target.value)}
                          placeholder="Descreva o motivo..."
                          rows={2}
                          className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setRecusandoId(null); setMotivoRecusa(""); }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleRecusar(s.id)}
                            disabled={!motivoRecusa.trim() || isLoading}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                          >
                            {isLoading ? "Recusando..." : "Confirmar Recusa"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Edição inline — ajustes da equipe antes de aprovar */}
                    {editavel && isEditando && formEdicao && (
                      <FormularioEdicaoSolicitacao
                        aviso={
                          (s.status === "aprovada"
                            ? "A vaga criada a partir desta solicitação também será atualizada (inclusive na página pública de vagas), só nos campos que você alterar. Mudar o cargo muda o link público da vaga. "
                            : "Ajustes da equipe antes de aprovar. ") +
                          "O cliente passa a ver a versão editada no portal; a original fica registrada no histórico (auditoria)."
                        }
                        rotuloSalvar="Salvar ajustes"
                        form={formEdicao}
                        onChange={setFormEdicao}
                        erro={erroEdicao}
                        salvando={isLoading}
                        onCancelar={fecharEdicao}
                        onSalvar={() => handleSalvarEdicao(s.id)}
                      />
                    )}

                    {/* Actions */}
                    {!jaDecidida && !isRecusando && !isEditando && (
                      <div className="flex gap-2 justify-end pt-1 border-t border-gray-100">
                        <button
                          onClick={() => { setRecusandoId(s.id); setMotivoRecusa(""); fecharEdicao(); }}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {"❌"} Recusar
                        </button>
                        <button
                          onClick={() => abrirEdicao(s)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {"✏️"} Editar
                        </button>
                        <button
                          onClick={() => handleCriarVaga(s.id)}
                          disabled={isLoading}
                          className="text-xs px-4 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                          style={{ backgroundColor: "#16a34a", color: "#fff" }}
                        >
                          {isLoading ? "Criando..." : "✅ Criar Vaga"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl shadow-lg text-sm font-semibold"
            style={{ backgroundColor: "#065F46", color: "#fff" }}
          >
            {"✅"} {toast}
          </div>
        )}
      </div>
    </div>
  );
}
