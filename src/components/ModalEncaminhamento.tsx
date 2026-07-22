"use client";

import { useState, useEffect } from "react";
import { formatarData } from "@/lib/utils";
import { STATUS_ENCAMINHAMENTO, TIPOS_SERVICO } from "@/lib/constants";
import type { Cliente, Encaminhamento } from "@/types";

interface Props {
  isOpen: boolean;
  candidatoId: string;
  candidatoNome: string;
  vagaId?: string;
  vagaTitulo?: string;
  clienteIdInicial?: string | null;
  onClose: () => void;
  onConfirmar: (dados: {
    cliente_id: string;
    data_entrevista: string | null;
    status: "aguardando" | "aguardando_agendamento_cliente";
    tipo_servico: string;
    observacoes: string;
    vaga_id?: string;
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
  vagaId: vagaIdProp,
  vagaTitulo: vagaTituloProp,
  clienteIdInicial,
  onClose,
  onConfirmar,
}: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [historico, setHistorico] = useState<Encaminhamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const [clienteId, setClienteId] = useState("");
  const [modoEnvio, setModoEnvio] = useState<"direto" | "agendamento">("direto");
  const [dataEntrevista, setDataEntrevista] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [forcarEnvio, setForcarEnvio] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [autorizadoPor, setAutorizadoPor] = useState("");
  const [vagas, setVagas] = useState<{ id: string; titulo: string }[]>([]);
  const [vagaId, setVagaId] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);

  const clienteSelecionado = clientes.find((c) => c.id === clienteId);
  const duplicata = historico.find((e) => e.cliente_id === clienteId);

  const servicosDisponiveis =
    clienteSelecionado?.servicos?.length
      ? TIPOS_SERVICO.filter((t) => clienteSelecionado.servicos.includes(t.id))
      : TIPOS_SERVICO;

  useEffect(() => {
    setTipoServico("");
    setVagaId("");
    setVagas([]);
    if (!clienteId) return;
    fetch(`/api/vagas?cliente_id=${clienteId}`)
      .then((r) => r.json())
      .then(({ data }) => setVagas(data ?? []));
  }, [clienteId]);

  useEffect(() => {
    if (!isOpen) return;
    setClienteId(clienteIdInicial ?? "");
    setModoEnvio("direto");
    setDataEntrevista("");
    setTipoServico("");
    setObservacoes("");
    setErro("");
    setForcarEnvio(false);
    setJustificativa("");
    setAutorizadoPor("");
    setVagaId(vagaIdProp ?? "");
    setVagas([]);
    setTentouEnviar(false);
    // O componente nunca desmonta de verdade entre um envio e o próximo (fica
    // sempre no JSX, só alterna isOpen) — sem isso, "enviando" ficava travado em
    // true depois do primeiro encaminhamento bem-sucedido, prendendo o botão em
    // "Salvando..." pro resto da sessão.
    setEnviando(false);

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
  }, [isOpen, candidatoId, clienteIdInicial]);

  if (!isOpen) return null;

  const vagaIdFinal = vagaIdProp ?? vagaId;
  // Vaga veio pré-selecionada do Kanban (candidatura já existente) mas nenhum cliente
  // pôde ser resolvido nem por candidatos_vagas.cliente_id nem por vagas.cliente_id.
  const vagaSemClienteVinculado = Boolean(vagaIdProp) && !clienteIdInicial;

  const precisaData = modoEnvio === "direto";

  const handleConfirmar = async () => {
    setTentouEnviar(true);
    if (!clienteId || !tipoServico || (precisaData && !dataEntrevista)) {
      setErro(
        precisaData
          ? "Selecione o cliente, o tipo de serviço e a data da entrevista."
          : "Selecione o cliente e o tipo de serviço."
      );
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
      await onConfirmar({
        cliente_id: clienteId,
        data_entrevista: precisaData ? dataEntrevista : null,
        status: precisaData ? "aguardando" : "aguardando_agendamento_cliente",
        tipo_servico: tipoServico,
        observacoes: obsCompleta,
        vaga_id: vagaIdFinal || undefined,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar encaminhamento.");
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
              <h2 className="font-bold text-lg flex items-center gap-2">
                <span>📅</span> Agendar Entrevista com Cliente
              </h2>
              <p className="text-[#FFD700] text-sm mt-0.5">{candidatoNome}</p>
              {vagaTituloProp && (
                <p className="text-gray-400 text-xs mt-0.5">Vaga: {vagaTituloProp}</p>
              )}
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
                {vagaSemClienteVinculado && (
                  <p className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    Esta vaga não tem cliente vinculado. Selecione um cliente manualmente ou verifique o cadastro da vaga.
                  </p>
                )}
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

              {/* Vaga — read-only when pre-filled from Kanban */}
              {vagaIdProp && vagaTituloProp ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Vaga
                  </label>
                  <div className="input-field bg-gray-50 text-gray-700 cursor-default">
                    {vagaTituloProp}
                  </div>
                </div>
              ) : clienteId && vagas.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Vaga
                  </label>
                  <select
                    value={vagaId}
                    onChange={(e) => setVagaId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Selecione a vaga (opcional)...</option>
                    {vagas.map((v) => (
                      <option key={v.id} value={v.id}>{v.titulo}</option>
                    ))}
                  </select>
                </div>
              ) : null}

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
                        {duplicata.data_entrevista && <>{" em "}{formatarData(duplicata.data_entrevista)}</>}
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

              {/* Modo de envio */}
              {clienteId && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Como enviar *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModoEnvio("direto")}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-sm font-semibold"
                      style={
                        modoEnvio === "direto"
                          ? { backgroundColor: "#111827", color: "#FFD700", borderColor: "#111827" }
                          : { backgroundColor: "#ffffff", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      {"📤"} Mover e enviar direto
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoEnvio("agendamento")}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-sm font-semibold"
                      style={
                        modoEnvio === "agendamento"
                          ? { backgroundColor: "#111827", color: "#FFD700", borderColor: "#111827" }
                          : { backgroundColor: "#ffffff", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      {"📅"} Pedir agendamento ao cliente
                    </button>
                  </div>
                  {modoEnvio === "agendamento" && (
                    <p className="text-xs text-gray-500 mt-2">
                      O candidato será enviado sem data de entrevista definida — o cliente poderá marcar a data depois.
                    </p>
                  )}
                </div>
              )}

              {/* Data */}
              {precisaData && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Data da entrevista *
                  </label>
                  <input
                    type="date"
                    value={dataEntrevista}
                    onChange={(e) => setDataEntrevista(e.target.value)}
                    className="input-field"
                    style={tentouEnviar && !dataEntrevista ? { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" } : undefined}
                  />
                  {tentouEnviar && !dataEntrevista && (
                    <p className="text-red-500 text-xs mt-1">Informe a data da entrevista.</p>
                  )}
                </div>
              )}

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

              {/* Resumo */}
              {clienteId && tipoServico && (!precisaData || dataEntrevista) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Resumo</p>
                  <p className="text-sm text-gray-700">
                    <strong>{candidatoNome}</strong>{" "}
                    {precisaData
                      ? "será agendado para entrevista com"
                      : "será enviado, aguardando o cliente definir a data da entrevista, para"}{" "}
                    <strong>{clienteSelecionado?.nome ?? "—"}</strong>
                    {precisaData && (
                      <> em <strong>{dataEntrevista.split("-").reverse().join("/")}</strong></>
                    )}
                    {(vagaTituloProp || vagas.find((v) => v.id === vagaId)?.titulo) && (
                      <> para a vaga <strong>{vagaTituloProp || vagas.find((v) => v.id === vagaId)?.titulo}</strong></>
                    )}
                    .
                  </p>
                </div>
              )}

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
                  disabled={enviando || !clienteId || !tipoServico || (precisaData && !dataEntrevista)}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {enviando ? "Salvando..." : precisaData ? "Confirmar encaminhamento" : "Enviar e pedir agendamento"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}