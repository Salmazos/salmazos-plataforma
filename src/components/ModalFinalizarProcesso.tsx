"use client";

import { useState } from "react";
import { MOTIVOS_REPROVACAO_INTERNA, OUTRO_MOTIVO_REPROVACAO } from "@/lib/motivos-reprovacao";

interface Props {
  isOpen: boolean;
  resultado: "contratado" | "reprovado_final";
  candidatoNome: string;
  vagaTitulo: string;
  tipoServico?: string | null;
  cvId: string;
  onClose: () => void;
  onConfirmar: (res: FinalizarResult) => void;
}

export interface FinalizarResult {
  resultado: "contratado" | "reprovado_final";
  vaga_encerrada?: boolean;
  vaga_reaberta?: boolean;
}

// Soma dias em uma data "YYYY-MM-DD" usando componentes locais (evita
// deslocamento de fuso horário que ocorreria com new Date(string) + setDate).
function somarDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  d.setDate(d.getDate() + dias);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const RESPONSAVEIS = [
  "Cliente",
  "Candidato",
  "Ambos",
  "Externo (vaga cancelada, corte de budget, etc.)",
  "Salmazos RH (decisão interna)",
];

function EncerrarInfoBox({ motivo, vagaCancelada }: { motivo: string; vagaCancelada: boolean }) {
  if (!motivo && !vagaCancelada) return null;
  let bg: string, border: string, color: string, text: string;
  if (vagaCancelada) {
    bg = "#FFFBEB"; border = "#FCD34D"; color = "#92400E";
    text = "A vaga será reaberta automaticamente e o candidato retornará ao Banco de Candidatos.";
  } else if (motivo === "Desistência do processo seletivo") {
    bg = "#EFF6FF"; border = "#93C5FD"; color = "#1E40AF";
    text = "O candidato retornará ao Banco de Candidatos disponível para outras vagas.";
  } else {
    bg = "#F9FAFB"; border = "#E5E7EB"; color = "#374151";
    text = "O candidato retornará ao Banco de Candidatos.";
  }
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ fontSize: 13, color, margin: 0 }}><strong style={{ marginRight: 4 }}>ℹ️</strong> {text}</p>
    </div>
  );
}

function ContratadoInfoBox({ tipoServico }: { tipoServico: string | null }) {
  let bg: string, border: string, color: string, text: string;
  switch (tipoServico) {
    case "mao_obra_temporaria":
      bg = "#FFFBEB"; border = "#FCD34D"; color = "#92400E";
      text = "O candidato será registrado pela Salmazos. Contrato MOT tem prazo máximo de 180 dias.";
      break;
    case "recrutamento_selecao":
      bg = "#EFF6FF"; border = "#93C5FD"; color = "#1E40AF";
      text = "O candidato será contratado diretamente pelo cliente. A Salmazos encerra sua participação após a contratação.";
      break;
    case "terceirizacao":
      bg = "#F0FDF4"; border = "#86EFAC"; color = "#166534";
      text = "O candidato será alocado via Salmazos. Contrato inicial de até 180 dias, renovável.";
      break;
    default:
      return null;
  }
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ fontSize: 13, color, margin: 0 }}><strong style={{ marginRight: 4 }}>ℹ️</strong> {text}</p>
    </div>
  );
}

function getContratadoConfig(tipoServico: string | null) {
  switch (tipoServico) {
    case "mao_obra_temporaria":
      return {
        title: "🎉 Finalizar — Alocação Temporária (MOT)",
        dataFimLabel: "Data de Término * (máx. 180 dias)",
        dataFimRequired: true,
        dataFimHelper: "Contrato MOT: máximo 180 dias, prorrogável por mais 90 dias (Lei 6.019/74)",
        showRenovavel: false,
        btnLabel: "Confirmar Alocação",
      };
    case "recrutamento_selecao":
      return {
        title: "🎉 Finalizar — Contratação (R&S)",
        dataFimLabel: "Data de Término (opcional)",
        dataFimRequired: false,
        dataFimHelper: "Deixe em branco para contratação por prazo indeterminado",
        showRenovavel: false,
        btnLabel: "Confirmar Contratação",
      };
    case "terceirizacao":
      return {
        title: "🎉 Finalizar — Alocação (Terceirização)",
        dataFimLabel: "Data de Término * (máx. 180 dias)",
        dataFimRequired: true,
        dataFimHelper: "Contrato inicial: máximo 180 dias, renovável em seguida",
        showRenovavel: true,
        btnLabel: "Confirmar Alocação",
      };
    default:
      return {
        title: "🎉 Finalizar — Contratação",
        dataFimLabel: "Data de Término (opcional)",
        dataFimRequired: false,
        dataFimHelper: null,
        showRenovavel: false,
        btnLabel: "Confirmar Contratação",
      };
  }
}

export default function ModalFinalizarProcesso({
  isOpen,
  resultado,
  candidatoNome,
  vagaTitulo,
  tipoServico,
  cvId,
  onClose,
  onConfirmar,
}: Props) {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [renovavel, setRenovavel] = useState(true);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [vagaCanceladaCliente, setVagaCanceladaCliente] = useState(false);
  const [responsavelEncerramento, setResponsavelEncerramento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);

  if (!isOpen) return null;

  const isContratado = resultado === "contratado";
  const cfg = getContratadoConfig(tipoServico ?? null);
  const invalidStyle = { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" };
  const isOutroMotivo = motivoReprovacao === OUTRO_MOTIVO_REPROVACAO;
  // MOT e terceirização: contrato inicial obrigatoriamente limitado a 180 dias — a
  // terceirização normalmente também começa com um contrato temporário. R&S fica de
  // fora (cliente contrata direto e gerencia o prazo, Salmazos não acompanha).
  const exigeDataFim = tipoServico === "mao_obra_temporaria" || tipoServico === "terceirizacao";
  const dataFimMax = exigeDataFim && dataInicio ? somarDias(dataInicio, 180) : undefined;

  const handleConfirmar = async () => {
    setTentouEnviar(true);

    if (isContratado) {
      if (!dataInicio) { setErro("Informe a data de início."); return; }
      if (cfg.dataFimRequired && !dataFim) { setErro("Informe a data de término."); return; }
      if (exigeDataFim && dataFim && dataFimMax && dataFim > dataFimMax) {
        setErro(`Data de término não pode ultrapassar 180 dias da data de início (máx. ${dataFimMax.split("-").reverse().join("/")}).`);
        return;
      }
    } else {
      if (!motivoReprovacao) { setErro("Selecione o motivo do encerramento."); return; }
      if (isOutroMotivo && !motivoOutro.trim()) { setErro("Descreva o motivo."); return; }
      if (!responsavelEncerramento) { setErro("Selecione o responsável pelo encerramento."); return; }
    }

    setEnviando(true);
    setErro("");
    try {
      const motivoFinal = isOutroMotivo ? `Outro motivo: ${motivoOutro.trim()}` : motivoReprovacao;
      const res = await fetch(`/api/candidatos-vagas/${cvId}/finalizar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultado,
          ...(isContratado
            ? {
                data_inicio: dataInicio,
                data_fim: dataFim || null,
                renovavel: tipoServico === "terceirizacao" ? renovavel : undefined,
                tipo_servico: tipoServico,
              }
            : {
                motivo_reprovacao: motivoFinal,
                responsavel_encerramento: responsavelEncerramento,
                vaga_cancelada_cliente: vagaCanceladaCliente,
              }),
          observacoes: observacoes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao finalizar.");
        setEnviando(false);
        return;
      }
      onConfirmar({
        resultado,
        vaga_encerrada: json.vaga_encerrada,
        vaga_reaberta: json.vaga_reaberta,
      });
    } catch {
      setErro("Erro de conexão.");
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div
          className="px-6 py-4 rounded-t-2xl text-white"
          style={{ background: isContratado ? "#065F46" : "#111827" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg">
                {isContratado ? cfg.title : "Finalizar — Encerrar Processo"}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: isContratado ? "#6EE7B7" : "#FFD700" }}>
                {candidatoNome}
              </p>
              <p className="text-xs mt-0.5 text-gray-400">Vaga: {vagaTitulo}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {isContratado ? (
            <>
              {/* Data de Início */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Data de Início *
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => {
                    const novaDataInicio = e.target.value;
                    setDataInicio(novaDataInicio);
                    if (exigeDataFim && novaDataInicio && !dataFim) {
                      setDataFim(somarDias(novaDataInicio, 90));
                    }
                  }}
                  className="input-field"
                  style={tentouEnviar && !dataInicio ? invalidStyle : undefined}
                />
                {tentouEnviar && !dataInicio && (
                  <p className="text-red-500 text-xs mt-1">Informe a data de início.</p>
                )}
              </div>

              {/* Data de Término */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  {cfg.dataFimLabel}
                </label>
                <input
                  type="date"
                  value={dataFim}
                  max={dataFimMax}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="input-field"
                  style={
                    (tentouEnviar && cfg.dataFimRequired && !dataFim) ||
                    (exigeDataFim && dataFim && dataFimMax && dataFim > dataFimMax)
                      ? invalidStyle
                      : undefined
                  }
                />
                {cfg.dataFimHelper && (
                  <p className="text-gray-400 text-xs mt-1">{cfg.dataFimHelper}</p>
                )}
                {tentouEnviar && cfg.dataFimRequired && !dataFim && (
                  <p className="text-red-500 text-xs mt-1">Informe a data de término.</p>
                )}
                {exigeDataFim && dataFim && dataFimMax && dataFim > dataFimMax && (
                  <p className="text-red-500 text-xs mt-1">
                    Máximo de 180 dias a partir da data de início ({dataFimMax.split("-").reverse().join("/")}).
                  </p>
                )}
              </div>

              {/* Renovável (terceirização only) */}
              {cfg.showRenovavel && (
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={renovavel}
                      onChange={(e) => setRenovavel(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className="w-9 h-5 rounded-full peer-focus:ring-2 peer-focus:ring-green-300 transition-colors"
                      style={{ backgroundColor: renovavel ? "#16A34A" : "#D1D5DB" }}
                    >
                      <div
                        className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                        style={{ transform: renovavel ? "translateX(16px)" : "translateX(0)" }}
                      />
                    </div>
                  </label>
                  <span className="text-sm text-gray-700 font-medium">Contrato renovável?</span>
                </div>
              )}

              {/* Info box */}
              <ContratadoInfoBox tipoServico={tipoServico ?? null} />
            </>
          ) : (
            <>
              {/* Motivo */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Motivo do Encerramento *
                </label>
                <select
                  value={motivoReprovacao}
                  onChange={(e) => setMotivoReprovacao(e.target.value)}
                  className="input-field"
                  style={tentouEnviar && !motivoReprovacao ? invalidStyle : undefined}
                >
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS_REPROVACAO_INTERNA.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {tentouEnviar && !motivoReprovacao && (
                  <p className="text-red-500 text-xs mt-1">Selecione o motivo do encerramento.</p>
                )}
              </div>

              {isOutroMotivo && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Descreva o motivo:
                  </label>
                  <textarea
                    value={motivoOutro}
                    onChange={(e) => setMotivoOutro(e.target.value)}
                    placeholder="Descreva o motivo..."
                    rows={2}
                    className="input-field resize-none"
                    style={tentouEnviar && !motivoOutro.trim() ? invalidStyle : undefined}
                  />
                </div>
              )}

              {/* Vaga cancelada pelo cliente */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vagaCanceladaCliente}
                  onChange={(e) => setVagaCanceladaCliente(e.target.checked)}
                  className="accent-black"
                />
                <span className="text-sm text-gray-700 font-medium">Vaga foi cancelada pelo cliente</span>
              </label>

              {/* Responsável */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Responsável pelo encerramento *
                </label>
                <select
                  value={responsavelEncerramento}
                  onChange={(e) => setResponsavelEncerramento(e.target.value)}
                  className="input-field"
                  style={tentouEnviar && !responsavelEncerramento ? invalidStyle : undefined}
                >
                  <option value="">Selecione...</option>
                  {RESPONSAVEIS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {tentouEnviar && !responsavelEncerramento && (
                  <p className="text-red-500 text-xs mt-1">Selecione o responsável.</p>
                )}
              </div>

              <EncerrarInfoBox motivo={motivoReprovacao} vagaCancelada={vagaCanceladaCliente} />
            </>
          )}

          {/* Observações/Comentário */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {isContratado ? "Observações" : "Comentário"}
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder={isContratado ? "Salário, horário, local de trabalho, benefícios..." : "Detalhes adicionais..."}
              className="input-field resize-none"
            />
          </div>

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-2 border-t">
            <button onClick={onClose} className="btn-outline flex-1" disabled={enviando}>Cancelar</button>
            <button
              onClick={handleConfirmar}
              disabled={enviando}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: isContratado ? "#16A34A" : "#374151" }}
            >
              {enviando ? "Salvando..." : isContratado ? cfg.btnLabel : "Encerrar Processo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
