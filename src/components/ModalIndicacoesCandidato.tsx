"use client";

import { useState, useEffect } from "react";
import { BotaoCurriculo } from "./BotaoCurriculo";

const TIPO_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  recrutamento_selecao: { label: "R&S", bg: "#1D6FA4", color: "#fff" },
  mao_obra_temporaria: { label: "MOT", bg: "#FFD700", color: "#000" },
  terceirizacao: { label: "Terceirização", bg: "#1D9E75", color: "#fff" },
};

const ADM_CAMPOS: { key: string; label: string }[] = [
  { key: "admissao_data_inicio", label: "Data de Início" },
  { key: "admissao_setor", label: "Setor" },
  { key: "admissao_centro_custo", label: "Centro de Custo" },
  { key: "admissao_horario", label: "Horário" },
  { key: "admissao_gestor", label: "Gestor Direto" },
  { key: "admissao_periodo_experiencia", label: "Período de Experiência" },
  { key: "admissao_funcao", label: "Função" },
  { key: "admissao_turno", label: "Turno" },
  { key: "admissao_escala", label: "Escala" },
  { key: "admissao_tempo_contrato", label: "Tempo de Contrato" },
  { key: "admissao_exame_responsavel", label: "Exame Admissional" },
  { key: "admissao_local_integracao", label: "Local/Data Integração" },
  { key: "admissao_observacoes", label: "Observações" },
];

interface Indicacao {
  id: string;
  cliente_nome: string;
  candidato_nome: string;
  candidato_telefone: string;
  curriculo_url: string | null;
  status: string;
  motivo_recusa: string | null;
  created_at: string;
  vagas: { titulo: string; tipo_servico: string } | null;
  admissao_data_inicio: string | null;
  admissao_salario: number | null;
  admissao_salario_hora: number | null;
  admissao_vt: boolean | null;
  [key: string]: unknown;
}

interface Duplicado {
  candidato_id: string;
  candidato_nome: string;
  etapa_kanban: string;
  criterio: string;
  vaga_titulo?: string;
  cliente_nome?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAprovado: () => void;
  focoId?: string | null;
  onVerTodas?: () => void;
}

function valorAdmissao(item: Indicacao, key: string): string {
  const val = item[key];
  if (val == null || val === "") return "";
  if (key === "admissao_data_inicio") return String(val).split("-").reverse().join("/");
  return String(val);
}

export default function ModalIndicacoesCandidato({ isOpen, onClose, onAprovado, focoId, onVerTodas }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Indicacao[]>([]);
  const [toast, setToast] = useState("");
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; msg: string } | null>(null);
  const [duplicados, setDuplicados] = useState<Record<string, Duplicado[]>>({});
  const [carregandoDuplicados, setCarregandoDuplicados] = useState<Set<string>>(new Set());
  const [vincularPara, setVincularPara] = useState<{ indicacaoId: string; candidatoId: string } | null>(null);
  const [confirmarCriarNovo, setConfirmarCriarNovo] = useState<string | null>(null);

  const buscarDuplicados = async (indicacaoId: string) => {
    setCarregandoDuplicados((prev) => new Set(prev).add(indicacaoId));
    try {
      const res = await fetch(`/api/solicitacoes-indicacao-candidato/buscar-duplicados?indicacao_id=${indicacaoId}`);
      const json = await res.json();
      if (res.ok && json.duplicados?.length > 0) {
        setDuplicados((prev) => ({ ...prev, [indicacaoId]: json.duplicados }));
      }
    } catch (e) {
      console.error("Erro ao buscar duplicados:", e);
    } finally {
      setCarregandoDuplicados((prev) => {
        const next = new Set(prev);
        next.delete(indicacaoId);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    if (focoId) {
      fetch(`/api/solicitacoes-indicacao-candidato/${focoId}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.data) {
            setItems([json.data]);
            buscarDuplicados(json.data.id);
          } else {
            setItems([]);
          }
        })
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
      return;
    }
    fetch("/api/solicitacoes-indicacao-candidato")
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? [];
        setItems(data);
        data.forEach((item: Indicacao) => buscarDuplicados(item.id));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [isOpen, focoId]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const handleDecidir = async (id: string, acao: "aprovar" | "recusar", candidatoExistenteId?: string) => {
    if (acao === "recusar" && !motivoRecusa.trim()) return;
    setActionLoading(id);
    setErro(null);
    try {
      const body = acao === "aprovar"
        ? { acao, ...(candidatoExistenteId && { candidato_existente_id: candidatoExistenteId }) }
        : { acao, motivo: motivoRecusa.trim() };

      const res = await fetch(`/api/solicitacoes-indicacao-candidato/${id}/decisao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro({ id, msg: typeof json.error === "string" ? json.error : "Erro ao registrar a decisão." });
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== id));
      setRecusandoId(null);
      setMotivoRecusa("");
      setVincularPara(null);
      setConfirmarCriarNovo(null);
      showToast(
        acao === "aprovar"
          ? candidatoExistenteId
            ? `Indicação aprovada e vinculada a ${json.candidato_id || "candidato"}. Confira o card no Kanban em Retorno Cliente.`
            : "Indicação aprovada — o candidato já está no Kanban em \"Aprovado pelo Cliente\"."
          : "Indicação recusada."
      );
      if (acao === "aprovar") onAprovado();
      if (focoId) onVerTodas?.();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg">
            {"🧑‍💼"} {focoId ? "Indicação Direta de Candidato" : "Indicações Diretas Pendentes"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {focoId && (
            <button onClick={() => onVerTodas?.()} className="text-xs text-blue-600 underline underline-offset-2 mb-4">
              ← ver todas as indicações pendentes
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
                {focoId ? "Indicação não encontrada." : "Nenhuma indicação pendente!"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((it) => {
                const tipo = it.vagas
                  ? TIPO_LABEL[it.vagas.tipo_servico] ?? { label: it.vagas.tipo_servico, bg: "#6B7280", color: "#fff" }
                  : null;
                const isRecusando = recusandoId === it.id;
                const isLoading = actionLoading === it.id;
                const admPreenchidos = ADM_CAMPOS.filter((c) => valorAdmissao(it, c.key));

                return (
                  <div key={it.id} className="border border-gray-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm">{it.candidato_nome}</span>
                      <span className="text-gray-300">—</span>
                      <span className="font-semibold text-gray-800 text-sm">{it.candidato_telefone}</span>
                      {tipo && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: tipo.bg, color: tipo.color }}>
                          {tipo.label}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {new Date(it.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{it.cliente_nome}</span> indicou pra vaga{" "}
                      <span className="font-medium text-gray-700">{it.vagas?.titulo ?? "—"}</span>
                    </div>

                    {it.curriculo_url && (
                      <BotaoCurriculo storagePath={it.curriculo_url} variant="link" label="Ver currículo anexado" />
                    )}

                    {(it.admissao_salario != null || it.admissao_salario_hora != null || admPreenchidos.length > 0) && (
                      <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {it.admissao_salario_hora != null && (
                          <div><span className="text-gray-400">Salário:</span> R$ {Number(it.admissao_salario_hora).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/hora</div>
                        )}
                        {it.admissao_salario != null && it.admissao_salario_hora == null && (
                          <div><span className="text-gray-400">Salário:</span> R$ {Number(it.admissao_salario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</div>
                        )}
                        {it.admissao_vt != null && (
                          <div><span className="text-gray-400">Vale Transporte:</span> {it.admissao_vt ? "Sim" : "Não"}</div>
                        )}
                        {admPreenchidos.map((c) => (
                          <div key={c.key}><span className="text-gray-400">{c.label}:</span> {valorAdmissao(it, c.key)}</div>
                        ))}
                      </div>
                    )}

                    {erro?.id === it.id && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro.msg}</p>
                    )}

                    {(duplicados[it.id]?.length ?? 0) > 0 && !vincularPara && !confirmarCriarNovo && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-900">
                          ⚠️ Candidato(s) duplicado(s) encontrado(s)
                        </p>
                        {duplicados[it.id].map((dup) => (
                          <div key={dup.candidato_id} className="text-xs text-amber-800 bg-white rounded px-2 py-1.5">
                            <p className="font-medium">{dup.candidato_nome}</p>
                            <p className="text-amber-600">
                              Critério: {dup.criterio} · Etapa: {dup.etapa_kanban}
                              {dup.vaga_titulo && ` · Última vaga: ${dup.vaga_titulo}`}
                            </p>
                            <button
                              onClick={() => setVincularPara({ indicacaoId: it.id, candidatoId: dup.candidato_id })}
                              className="text-xs text-blue-600 font-semibold border border-blue-300 rounded px-2 py-1 mt-1 hover:bg-blue-50"
                            >
                              Vincular a este
                            </button>
                          </div>
                        ))}
                        <div className="pt-2">
                          <button
                            onClick={() => setConfirmarCriarNovo(it.id)}
                            className="text-xs text-gray-600 font-semibold border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                          >
                            Criar novo mesmo assim
                          </button>
                        </div>
                      </div>
                    )}

                    {vincularPara?.indicacaoId === it.id && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 items-center">
                        <p className="text-xs text-blue-900 flex-1">
                          ✓ Vinculando a: <strong>{duplicados[it.id]?.find((d) => d.candidato_id === vincularPara.candidatoId)?.candidato_nome || "..."}</strong>
                        </p>
                        <button
                          onClick={() => setVincularPara(null)}
                          className="text-xs text-blue-600 underline whitespace-nowrap"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}

                    {confirmarCriarNovo === it.id && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-orange-900">
                          Tem certeza que deseja criar um novo candidato?
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setConfirmarCriarNovo(null)}
                            className="text-xs text-gray-600 px-2 py-1"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => { setConfirmarCriarNovo(null); handleDecidir(it.id, "aprovar"); }}
                            className="text-xs font-semibold text-white bg-orange-600 rounded px-3 py-1 hover:bg-orange-700"
                          >
                            Sim, criar novo
                          </button>
                        </div>
                      </div>
                    )}

                    {it.status === "pendente" && (
                      isRecusando ? (
                        <div className="space-y-2">
                          <textarea
                            value={motivoRecusa}
                            onChange={(e) => setMotivoRecusa(e.target.value)}
                            placeholder="Motivo da recusa (o cliente não é avisado automaticamente — combine por fora)"
                            className="w-full text-xs border border-gray-200 rounded-lg p-2"
                            rows={2}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setRecusandoId(null); setMotivoRecusa(""); }}
                              className="text-xs text-gray-500 px-3 py-1.5"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleDecidir(it.id, "recusar")}
                              disabled={isLoading || !motivoRecusa.trim()}
                              className="text-xs font-semibold text-white bg-red-600 rounded-lg px-3 py-1.5 disabled:opacity-50"
                            >
                              {isLoading ? "Recusando..." : "Confirmar recusa"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            onClick={() => setRecusandoId(it.id)}
                            disabled={isLoading}
                            className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Recusar
                          </button>
                          {vincularPara?.indicacaoId === it.id ? (
                            <button
                              onClick={() => handleDecidir(it.id, "aprovar", vincularPara.candidatoId)}
                              disabled={isLoading}
                              className="text-xs font-semibold text-black bg-[#FFD700] rounded-lg px-3 py-1.5 hover:brightness-95 disabled:opacity-50"
                            >
                              {isLoading ? "Vinculando..." : "Confirmar vínculo"}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDecidir(it.id, "aprovar")}
                              disabled={isLoading}
                              className="text-xs font-semibold text-black bg-[#FFD700] rounded-lg px-3 py-1.5 hover:brightness-95 disabled:opacity-50"
                            >
                              {isLoading ? "Aprovando..." : "Aprovar e registrar candidato"}
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {toast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
