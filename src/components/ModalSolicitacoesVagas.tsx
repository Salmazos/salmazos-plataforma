"use client";

import { useState, useEffect } from "react";
import { mensagemDecisaoSolicitacao } from "@/lib/solicitacaoVagaStatus";

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
  observacoes: string | null;
  confidencial: boolean;
  created_at: string;
  status: string;
  aprovada_por: string | null;
  aprovada_em: string | null;
  motivo_recusa: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVagaCriada: () => void;
  focoId?: string | null;
  onVerTodas?: () => void;
}

// Campos que a equipe pode ajustar numa solicitação pendente antes de aprovar (ver PATCH
// /api/solicitacoes-vagas/[id]) — os mesmos que o card mostra e que viram a vaga.
interface FormEdicao {
  cargo: string;
  tipo_servico: string;
  num_posicoes: string;
  cidade: string;
  estado: string;
  salario: string;
  adicionais_salariais: string;
  previsao_inicio: string;
  horario_texto: string;
  requisitos: string;
  beneficios: string;
  observacoes: string;
  confidencial: boolean;
}

function formDeSolicitacao(s: Solicitacao): FormEdicao {
  return {
    cargo: s.cargo,
    tipo_servico: s.tipo_servico,
    num_posicoes: String(s.num_posicoes ?? 1),
    cidade: s.cidade ?? "",
    estado: s.estado ?? "",
    salario: s.salario ?? "",
    adicionais_salariais: s.adicionais_salariais ?? "",
    previsao_inicio: s.previsao_inicio ?? "",
    horario_texto: s.horario_texto ?? "",
    requisitos: s.requisitos ?? "",
    beneficios: s.beneficios ?? "",
    observacoes: s.observacoes ?? "",
    confidencial: s.confidencial,
  };
}

export default function ModalSolicitacoesVagas({ isOpen, onClose, onVagaCriada, focoId, onVerTodas }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Solicitacao[]>([]);
  const [toast, setToast] = useState("");
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormEdicao | null>(null);
  const [erroEdicao, setErroEdicao] = useState("");

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
        body: JSON.stringify({
          ...formEdicao,
          num_posicoes: Number(formEdicao.num_posicoes) || 1,
          estado: formEdicao.estado.toUpperCase(),
          previsao_inicio: formEdicao.previsao_inicio || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroEdicao(typeof json.error === "string" ? json.error : "Erro ao salvar.");
        return;
      }
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...json.data } : s)));
      fecharEdicao();
      showToast("Solicitação atualizada.");
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

                    {s.observacoes && (
                      <p className="text-xs text-gray-500 italic">
                        {"💬"} {s.observacoes}
                      </p>
                    )}

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
                    {!jaDecidida && isEditando && formEdicao && (
                      <FormularioEdicao
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

function FormularioEdicao({
  form,
  onChange,
  erro,
  salvando,
  onCancelar,
  onSalvar,
}: {
  form: FormEdicao;
  onChange: (f: FormEdicao) => void;
  erro: string;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  const set = <K extends keyof FormEdicao>(campo: K, valor: FormEdicao[K]) => onChange({ ...form, [campo]: valor });
  const labelCls = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1";
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400";

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-xs text-gray-500">
        Ajustes da equipe antes de aprovar. O cliente passa a ver a versão editada no portal; a original fica
        registrada no histórico (auditoria).
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Cargo *</label>
          <input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Tipo de serviço</label>
          <select value={form.tipo_servico} onChange={(e) => set("tipo_servico", e.target.value)} className={inputCls}>
            <option value="recrutamento_selecao">R&S</option>
            <option value="mao_obra_temporaria">MOT</option>
            <option value="terceirizacao">Terceirização</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Posições</label>
          <input
            type="number"
            min={1}
            value={form.num_posicoes}
            onChange={(e) => set("num_posicoes", e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-3">
          <label className={labelCls}>Cidade *</label>
          <input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>UF</label>
          <input
            value={form.estado}
            maxLength={2}
            onChange={(e) => set("estado", e.target.value.toUpperCase())}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Salário</label>
          <input value={form.salario} onChange={(e) => set("salario", e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Adicionais salariais</label>
          <input
            value={form.adicionais_salariais}
            onChange={(e) => set("adicionais_salariais", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Previsão de início</label>
          <input
            type="date"
            value={form.previsao_inicio}
            onChange={(e) => set("previsao_inicio", e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Horário</label>
          <input value={form.horario_texto} onChange={(e) => set("horario_texto", e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Requisitos</label>
          <textarea
            rows={4}
            value={form.requisitos}
            onChange={(e) => set("requisitos", e.target.value)}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Benefícios (um por linha)</label>
          <textarea
            rows={3}
            value={form.beneficios}
            onChange={(e) => set("beneficios", e.target.value)}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>Observações</label>
          <textarea
            rows={3}
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            className={`${inputCls} resize-y`}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={form.confidencial} onChange={(e) => set("confidencial", e.target.checked)} />
        Vaga confidencial
      </label>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancelar}
          disabled={salvando}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onSalvar}
          disabled={salvando}
          className="text-xs px-4 py-1.5 rounded-lg font-bold bg-black text-[#FFD700] disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar ajustes"}
        </button>
      </div>
    </div>
  );
}
