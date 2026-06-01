"use client";

import { useState, useEffect } from "react";
import { formatarData } from "@/lib/utils";
import { STATUS_ENCAMINHAMENTO, TIPOS_SERVICO } from "@/lib/constants";
import type { Cliente, Encaminhamento } from "@/types";

interface Props {
  isOpen: boolean;
  candidatoId: string;
  candidatoNome: string;
  onClose: () => void;
  onConfirmar: (dados: {
    cliente_id: string;
    data_entrevista: string;
    tipo_servico: string;
    observacoes: string;
  }) => Promise<void>;
}

const CORES_SERVICO: Record<string, { bg: string; text: string; border: string }> = {
  recrutamento_selecao:  { bg: "#1D6FA4", text: "#ffffff", border: "#1D6FA4" },
  mao_obra_temporaria:   { bg: "#FFD700", text: "#000000", border: "#e6c200" },
  terceirizacao:         { bg: "#1D9E75", text: "#ffffff", border: "#1D9E75" },
  avaliacao_psicologica: { bg: "#6B4FBB", text: "#ffffff", border: "#6B4FBB" },
};

export default function ModalEncaminhamento({
  isOpen,
  candidatoId,
  candidatoNome,
  onClose,
  onConfirmar,
}: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [historico, setHistorico] = useState<Encaminhamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const [clienteId, setClienteId] = useState("");
  const [dataEntrevista, setDataEntrevista] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [forcarEnvio, setForcarEnvio] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [autorizadoPor, setAutorizadoPor] = useState("");

  const clienteSelecionado = clientes.find((c) => c.id === clienteId);
  const duplicata = historico.find((e) => e.cliente_id === clienteId);

  const servicosDisponiveis =
    clienteSelecionado?.servicos?.length
      ? TIPOS_SERVICO.filter((t) => clienteSelecionado.servicos.includes(t.id))
      : TIPOS_SERVICO;

  useEffect(() => {
    setTipoServico("");
  }, [clienteId]);

  useEffect(() => {
    if (!isOpen) return;
    setClienteId("");
    setDataEntrevista("");
    setTipoServico("");
    setObservacoes("");
    setErro("");
    setForcarEnvio(false);
    setJustificativa("");
    setAutorizadoPor("");

    const carregar = async () => {
      setCarregando(true);
      try {
        const [resClientes, resHistorico] = await Promise.all([
          fetch("/api/clientes"),
          fetch(`/api/encaminhamentos?candidato_id=${candidatoId}`),
        ]);
        const { data: listaClientes } = await resClientes.json();
        const { data: listaHistorico } = await resHistorico.json();
        setClientes((listaClientes ?? []).filter((c: Cliente) => c.ativo));
        setHistorico(listaHistorico ?? []);
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [isOpen, candidatoId]);

  if (!isOpen) return null;

  const handleConfirmar = async () => {
    if (!clienteId || !dataEntrevista || !tipoServico) {
      setErro("Selecione o cliente, o tipo de serviço e a data da entrevista.");
      return;
    }
    if (duplicata && !forcarEnvio) {
      setErro("Resolva o aviso de duplicidade antes de confirmar.");
      return;
    }
    if (duplicata && forcarEnvio && (!justificativa.trim() || !autorizadoPor.trim())) {
      setErro("Preencha a justificativa e quem autorizou o reencaminhamento.");
      return;
    }
    const obsCompleta =
      duplicata && forcarEnvio
        ? `[Reencaminhamento autorizado por: ${autorizadoPor}] ${justificativa}${observacoes ? ` | ${observacoes}` : ""}`
        : observacoes;
    setEnviando(true);
    setErro("");
    try {
      await onConfirmar({ cliente_id: clienteId, data_entrevista: dataEntrevista, tipo_servico: tipoServico, observacoes: obsCompleta });
    } catch {
      setErro("Erro ao salvar encaminhamento.");
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg">Encaminhar para cliente</h2>
              <p className="text-[#FFD700] text-sm mt-0.5">{candidatoNome}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {carregando ? (
            <div className="text-center py-8 text-gray-400">
              <div className="w-6 h-6 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Carregando clientes...
            </div>
          ) : (
            <>
              {/* Seletor de cliente */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Cliente *
                </label>
                {clientes.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 border">
                    Nenhum cliente ativo cadastrado.{" "}
                    <a href="/painel/clientes" className="text-[#FFD700] font-medium hover:underline">
                      Cadastrar cliente
                    </a>
                  </div>
                ) : (
                  <select
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Selecione o cliente...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} — {c.cidade} ({c.segmento})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Alerta de duplicidade */}
              {duplicata && clienteSelecionado && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 space-y-3">
                  <div className="flex gap-2">
                    <svg className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-sm text-yellow-800">
                      <p className="font-semibold">Atenção: encaminhamento anterior detectado</p>
                      <a
                        href={`/painel/encaminhamentos?id=${duplicata.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block hover:underline"
                        style={{ color: "#92400e" }}
                      >
                        <strong>{candidatoNome}</strong>{" → "}
                        <strong>{clienteSelecionado.nome}</strong>
                        {" em "}{formatarData(duplicata.data_entrevista)}
                        {" · resultado: "}
                        <strong>{STATUS_ENCAMINHAMENTO[duplicata.status]?.label ?? duplicata.status}</strong>
                        {" ↗"}
                      </a>
                    </div>
                  </div>

                  {!forcarEnvio ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 text-sm font-semibold py-1.5 px-3 rounded-lg border border-yellow-400 text-yellow-800 hover:bg-yellow-100 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => setForcarEnvio(true)}
                        className="flex-1 text-sm font-semibold py-1.5 px-3 rounded-lg transition-colors"
                        style={{ background: "#ca8a04", color: "#fff" }}
                      >
                        Enviar mesmo assim
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1 border-t border-yellow-200">
                      <div>
                        <label className="block text-xs font-semibold text-yellow-800 uppercase tracking-wide mb-1">
                          Justificativa *
                        </label>
                        <input
                          type="text"
                          value={justificativa}
                          onChange={(e) => setJustificativa(e.target.value)}
                          placeholder="Descreva o motivo do reencaminhamento..."
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-yellow-800 uppercase tracking-wide mb-1">
                          Autorizado por *
                        </label>
                        <input
                          type="text"
                          value={autorizadoPor}
                          onChange={(e) => setAutorizadoPor(e.target.value)}
                          placeholder="Nome de quem autorizou ou cliente após contato..."
                          className="input-field"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tipo de serviço */}
              {clienteId && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Tipo de serviço *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {servicosDisponiveis.map((tipo) => {
                      const ativo = tipoServico === tipo.id;
                      const cores = CORES_SERVICO[tipo.id];
                      return (
                        <button
                          key={tipo.id}
                          type="button"
                          onClick={() => setTipoServico(tipo.id)}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-sm font-semibold"
                          style={
                            ativo
                              ? { backgroundColor: cores.bg, color: cores.text, borderColor: cores.border }
                              : { backgroundColor: "#ffffff", color: "#6b7280", borderColor: "#e5e7eb" }
                          }
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
                            style={{ borderColor: ativo ? cores.border : "#d1d5db" }}
                          >
                            {ativo && (
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: cores.text }}
                              />
                            )}
                          </span>
                          {tipo.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Data */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Data da entrevista *
                </label>
                <input
                  type="date"
                  value={dataEntrevista}
                  onChange={(e) => setDataEntrevista(e.target.value)}
                  className="input-field"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Observações
                </label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  placeholder="Informações adicionais para o cliente, requisitos específicos..."
                  className="input-field resize-none"
                />
              </div>

              {erro && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}

              {/* Ações */}
              <div className="flex gap-3 pt-2 border-t">
                <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmar}
                  disabled={enviando || !clienteId || !dataEntrevista || !tipoServico}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {enviando ? "Salvando..." : "Confirmar encaminhamento"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}