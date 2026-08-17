"use client";

import { useState, useEffect } from "react";
import { MOTIVOS_REPROVACAO_INTERNA, OUTRO_MOTIVO_REPROVACAO } from "@/lib/motivos-reprovacao";
import { TIPOS_SERVICO } from "@/lib/constants";
import CampoMoeda from "@/components/ui/CampoMoeda";

interface Props {
  isOpen: boolean;
  resultado: "contratado" | "reprovado_final";
  candidatoNome: string;
  vagaTitulo: string;
  // tipoServico: o vigente (encaminhamento mais recente, com fallback pra vaga) — decide o
  // comportamento do modal (campos, trava de fee). tipoServicoVaga: o cadastro original da
  // vaga, só pra detectar divergência e explicar isso na mensagem de aviso (ver PROBLEMA do
  // caso Embalatec/Márcio Schall — a mensagem dizia "vaga é R&S" quando na verdade só o
  // encaminhamento divergente é que era R&S).
  tipoServico?: string | null;
  tipoServicoVaga?: string | null;
  cvId: string;
  vagaId?: string | null;
  clienteId?: string | null;
  onClose: () => void;
  onConfirmar: (res: FinalizarResult) => void;
}

function labelTipoServico(id: string | null | undefined): string {
  return TIPOS_SERVICO.find((t) => t.id === id)?.label ?? id ?? "—";
}

interface FeeInfo {
  feeRsPercentual: number | null;
  admissaoFeeValor: number | null;
  admissaoFeePercentual: number | null;
  admissaoFeeOrigem: string | null;
}

interface ReaberturaInfo {
  reaberturaRecente: boolean;
  candidatoNome?: string | null;
  dataInicioAnterior?: string | null;
}

function formatarDataBR(dataISO: string): string {
  return dataISO.split("-").reverse().join("/");
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
  tipoServicoVaga,
  cvId,
  vagaId,
  clienteId,
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

  // Salário Acordado R&S
  const [admSalario, setAdmSalario] = useState("");
  const [feeInfo, setFeeInfo] = useState<FeeInfo | null>(null);
  const [temPortal, setTemPortal] = useState<boolean | null>(null);
  const [carregandoFee, setCarregandoFee] = useState(false);

  // Trava de "taxa R&S não configurada" — ver PROBLEMA 2 da investigação anterior
  // (fee_rs_percentual null fazia o cálculo do fee ser pulado em silêncio).
  const [mostrarAvisoFeeAusente, setMostrarAvisoFeeAusente] = useState(false);
  const [modoResolucaoFee, setModoResolucaoFee] = useState<"configurar" | "sem_taxa" | null>(null);
  const [novaTaxaPercentual, setNovaTaxaPercentual] = useState("");
  const [salvandoTaxa, setSalvandoTaxa] = useState(false);
  const [justificativaSemTaxa, setJustificativaSemTaxa] = useState("");
  const [erroFee, setErroFee] = useState("");

  // Decisão de gerar cobrança R&S — captada aqui, por contratação, no momento da
  // finalização (não mais no fechamento da vaga). null = ainda não respondido.
  const [gerarCobrancaRS, setGerarCobrancaRS] = useState<boolean | null>(null);
  const [reaberturaInfo, setReaberturaInfo] = useState<ReaberturaInfo | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMostrarAvisoFeeAusente(false);
    setModoResolucaoFee(null);
    setNovaTaxaPercentual("");
    setJustificativaSemTaxa("");
    setErroFee("");
    setGerarCobrancaRS(null);
    setReaberturaInfo(null);
  }, [isOpen, cvId]);

  // Contexto de reabertura recente (< 30 dias) pra essa vaga — dá base pra decisão de
  // cobrança quando essa contratação é uma reposição, seja por vínculo explícito de
  // garantia ou por reabertura manual da mesma vaga (ver /api/vagas/[id]/reabertura-recente).
  useEffect(() => {
    const precisa = isOpen && resultado === "contratado" && tipoServico === "recrutamento_selecao" && !!vagaId;
    if (!precisa) { setReaberturaInfo(null); return; }
    let cancelado = false;
    fetch(`/api/vagas/${vagaId}/reabertura-recente`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelado) setReaberturaInfo(j); })
      .catch(() => { if (!cancelado) setReaberturaInfo(null); });
    return () => { cancelado = true; };
  }, [isOpen, resultado, tipoServico, vagaId]);

  // Só busca fee/portal no fluxo R&S "Contratado" — os outros tipos de serviço
  // nunca usam esses dados, e a maioria dos cards do Kanban nunca chega aqui.
  useEffect(() => {
    const precisaFee = isOpen && resultado === "contratado" && tipoServico === "recrutamento_selecao" && !!cvId;
    if (!precisaFee) {
      setFeeInfo(null);
      setTemPortal(null);
      setAdmSalario("");
      return;
    }
    let cancelado = false;
    setCarregandoFee(true);
    Promise.all([
      fetch(`/api/candidatos-vagas/${cvId}/fee-info`).then((r) => (r.ok ? r.json() : null)),
      clienteId
        ? fetch(`/api/clientes/${clienteId}/tem-portal`).then((r) => (r.ok ? r.json() : null))
        : Promise.resolve({ temPortal: false }),
    ])
      .then(([fee, portal]) => {
        if (cancelado) return;
        setFeeInfo(fee);
        setTemPortal(portal?.temPortal ?? false);
      })
      .catch(() => {
        if (cancelado) return;
        setFeeInfo(null);
        setTemPortal(false);
      })
      .finally(() => {
        if (!cancelado) setCarregandoFee(false);
      });
    return () => { cancelado = true; };
  }, [isOpen, resultado, tipoServico, cvId, clienteId]);

  if (!isOpen) return null;

  const isContratado = resultado === "contratado";
  const cfg = getContratadoConfig(tipoServico ?? null);
  const feeJaLancado = feeInfo?.admissaoFeeValor != null;
  const salarioObrigatorio = isContratado && tipoServico === "recrutamento_selecao" && !feeJaLancado && temPortal === false;
  // Vaga de R&S, fee ainda não lançado por nenhum caminho, e a vaga não tem taxa (%)
  // configurada — sem isso o fee é pulado em silêncio no backend (ver finalizar/route.ts).
  const feeConfigPendente =
    isContratado && tipoServico === "recrutamento_selecao" && !feeJaLancado &&
    !carregandoFee && feeInfo != null && feeInfo.feeRsPercentual == null;
  // Vigente (tipoServico, do encaminhamento mais recente) diverge do cadastro original da
  // vaga — caso real que gerou confusão: aviso dizia "esta vaga é R&S" numa vaga MOT porque
  // só o encaminhamento estava (incorretamente) marcado como R&S.
  const divergeDeVaga = Boolean(tipoServico && tipoServicoVaga && tipoServico !== tipoServicoVaga);
  const invalidStyle = { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" };
  const isOutroMotivo = motivoReprovacao === OUTRO_MOTIVO_REPROVACAO;
  // MOT e terceirização: contrato inicial obrigatoriamente limitado a 180 dias — a
  // terceirização normalmente também começa com um contrato temporário. R&S fica de
  // fora (cliente contrata direto e gerencia o prazo, Salmazos não acompanha).
  const exigeDataFim = tipoServico === "mao_obra_temporaria" || tipoServico === "terceirizacao";
  const dataFimMax = exigeDataFim && dataInicio ? somarDias(dataInicio, 180) : undefined;

  // Faz de fato a chamada de finalização — separado de handleConfirmar pra poder ser
  // chamado tanto pelo fluxo normal (após passar pela trava de fee) quanto direto por
  // handleSalvarTaxaESeguir (que já sabe que acabou de resolver a pendência).
  const submeterFinalizacao = async (feeAusenteJustificativa?: string) => {
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
                admissao_salario: admSalario ? parseFloat(admSalario) : undefined,
                fee_ausente_justificativa: feeAusenteJustificativa,
                gerar_cobranca_rs: tipoServico === "recrutamento_selecao" ? gerarCobrancaRS : undefined,
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

  const handleConfirmar = async () => {
    setTentouEnviar(true);

    if (isContratado) {
      if (!dataInicio) { setErro("Informe a data de início."); return; }
      if (cfg.dataFimRequired && !dataFim) { setErro("Informe a data de término."); return; }
      if (exigeDataFim && dataFim && dataFimMax && dataFim > dataFimMax) {
        setErro(`Data de término não pode ultrapassar 180 dias da data de início (máx. ${dataFimMax.split("-").reverse().join("/")}).`);
        return;
      }
      if (salarioObrigatorio && !admSalario) { setErro("Informe o salário acordado."); return; }
      if (tipoServico === "recrutamento_selecao" && gerarCobrancaRS === null) {
        setErro("Responda se deve gerar cobrança de R&S para esta contratação.");
        return;
      }

      // Trava: vaga R&S sem taxa configurada não segue sem uma decisão explícita.
      if (feeConfigPendente && modoResolucaoFee !== "sem_taxa") {
        setMostrarAvisoFeeAusente(true);
        return;
      }
      if (modoResolucaoFee === "sem_taxa") {
        if (!justificativaSemTaxa.trim()) { setErro("Informe a justificativa para continuar sem a taxa configurada."); return; }
        setErro("");
        await submeterFinalizacao(justificativaSemTaxa.trim());
        return;
      }
    } else {
      if (!motivoReprovacao) { setErro("Selecione o motivo do encerramento."); return; }
      if (isOutroMotivo && !motivoOutro.trim()) { setErro("Descreva o motivo."); return; }
      if (!responsavelEncerramento) { setErro("Selecione o responsável pelo encerramento."); return; }
    }

    setErro("");
    await submeterFinalizacao();
  };

  // "Configurar taxa agora" — salva o percentual na vaga e, se deu certo, segue
  // direto pra finalização (sem precisar que o usuário clique em "Confirmar" de novo).
  const handleSalvarTaxaESeguir = async () => {
    const pct = parseFloat(novaTaxaPercentual.replace(",", "."));
    if (!novaTaxaPercentual.trim() || isNaN(pct) || pct <= 0) {
      setErroFee("Informe um percentual válido.");
      return;
    }
    if (!vagaId) {
      setErroFee("Vaga não identificada — não foi possível salvar a taxa.");
      return;
    }
    setSalvandoTaxa(true);
    setErroFee("");
    try {
      const res = await fetch(`/api/vagas/${vagaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fee_rs_percentual: pct }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErroFee(json.error || "Erro ao salvar a taxa.");
        return;
      }
      setFeeInfo((prev) => ({
        feeRsPercentual: pct,
        admissaoFeeValor: prev?.admissaoFeeValor ?? null,
        admissaoFeePercentual: prev?.admissaoFeePercentual ?? null,
        admissaoFeeOrigem: prev?.admissaoFeeOrigem ?? null,
      }));
      setMostrarAvisoFeeAusente(false);
      setModoResolucaoFee(null);
      await submeterFinalizacao();
    } finally {
      setSalvandoTaxa(false);
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

              {/* Salário Acordado (R&S only) */}
              {tipoServico === "recrutamento_selecao" && (
                <div>
                  {feeJaLancado ? (
                    <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "10px 14px" }}>
                      <p style={{ fontSize: 13, color: "#166534", margin: 0 }}>
                        <strong>Já lançado:</strong> R$ {feeInfo!.admissaoFeeValor!.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        {" — "}
                        {feeInfo?.admissaoFeeOrigem === "cliente_portal" ? "via portal do cliente" : "via analista"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Salário Acordado R$ {salarioObrigatorio && "*"}
                      </label>
                      <CampoMoeda
                        value={admSalario}
                        onChange={(v) => setAdmSalario(v > 0 ? String(v) : "")}
                        placeholder="Ex: 3.500,00"
                        className="input-field"
                        style={tentouEnviar && salarioObrigatorio && !admSalario ? invalidStyle : undefined}
                      />
                      {carregandoFee ? (
                        <p className="text-gray-400 text-xs mt-1">Verificando...</p>
                      ) : temPortal === true ? (
                        <p className="text-gray-400 text-xs mt-1">Deixe em branco se o cliente for confirmar isso pelo portal dele.</p>
                      ) : temPortal === false ? (
                        <p className="text-gray-400 text-xs mt-1">Cliente não tem acesso ao portal — este campo é obrigatório.</p>
                      ) : null}
                      {feeInfo?.feeRsPercentual != null && admSalario && (
                        <p style={{ fontSize: 12, color: "#92400E", marginTop: 6 }}>
                          <strong>Taxa Salmazos ({feeInfo.feeRsPercentual}%):</strong> R$ {(parseFloat(admSalario) * feeInfo.feeRsPercentual / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      {tentouEnviar && salarioObrigatorio && !admSalario && (
                        <p className="text-red-500 text-xs mt-1">Informe o salário acordado.</p>
                      )}
                    </>
                  )}
                </div>
              )}

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

              {/* Decisão de cobrança R&S — por contratação, capturada aqui */}
              {tipoServico === "recrutamento_selecao" && (
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px" }}>
                  {reaberturaInfo?.reaberturaRecente && (
                    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                      <p style={{ fontSize: 12, color: "#92400E", margin: 0, lineHeight: 1.5 }}>
                        ⚠️ Esta vaga foi reaberta e fechada de novo há menos de 30 dias
                        {reaberturaInfo.candidatoNome ? <> — candidato anterior: <strong>{reaberturaInfo.candidatoNome}</strong></> : ""}
                        {reaberturaInfo.dataInicioAnterior ? <> (início em {formatarDataBR(reaberturaInfo.dataInicioAnterior)})</> : ""}.
                      </p>
                    </div>
                  )}
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>
                    Gerar cobrança de R&S para esta contratação? *
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGerarCobrancaRS(false)}
                      className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors"
                      style={
                        gerarCobrancaRS === false
                          ? { background: "#374151", color: "#fff" }
                          : { background: "#fff", color: "#374151", border: "1px solid #D1D5DB" }
                      }
                    >
                      Não
                    </button>
                    <button
                      type="button"
                      onClick={() => setGerarCobrancaRS(true)}
                      className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-colors"
                      style={
                        gerarCobrancaRS === true
                          ? { background: "#16A34A", color: "#fff" }
                          : { background: "#fff", color: "#374151", border: "1px solid #D1D5DB" }
                      }
                    >
                      Sim
                    </button>
                  </div>
                  {tentouEnviar && gerarCobrancaRS === null && (
                    <p className="text-red-500 text-xs mt-1">Responda se deve gerar cobrança de R&S.</p>
                  )}
                </div>
              )}

              {/* Trava: taxa R&S não configurada na vaga */}
              {mostrarAvisoFeeAusente && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", margin: "0 0 4px" }}>
                    ⚠️ Taxa de R&S não configurada
                  </p>
                  <p style={{ fontSize: 12, color: "#92400E", margin: "0 0 10px", lineHeight: 1.5 }}>
                    {divergeDeVaga ? (
                      <>
                        Esta contratação foi negociada como <strong>{labelTipoServico(tipoServico)}</strong>, conforme o
                        encaminhamento mais recente — mas a vaga está cadastrada como <strong>{labelTipoServico(tipoServicoVaga)}</strong>.
                        Confirme se isso está correto antes de continuar. Além disso, a taxa (%) de R&S não está configurada
                        e o fee não será calculado se você continuar assim.
                      </>
                    ) : (
                      "Esta vaga é de Recrutamento e Seleção mas não tem taxa (%) configurada. O fee não será calculado se você continuar assim."
                    )}
                  </p>

                  {modoResolucaoFee === null && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setModoResolucaoFee("configurar")}
                        className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }}
                      >
                        Configurar taxa agora
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoResolucaoFee("sem_taxa")}
                        className="btn-outline" style={{ padding: "6px 12px", fontSize: 12 }}
                      >
                        Continuar sem taxa
                      </button>
                    </div>
                  )}

                  {modoResolucaoFee === "configurar" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Taxa R&S (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={novaTaxaPercentual}
                        onChange={(e) => setNovaTaxaPercentual(e.target.value)}
                        className="input-field"
                        placeholder="Ex: 40"
                        style={erroFee ? invalidStyle : undefined}
                      />
                      {erroFee && <p className="text-red-500 text-xs mt-1">{erroFee}</p>}
                      <div className="flex gap-2 justify-end mt-2">
                        <button
                          type="button"
                          onClick={() => { setModoResolucaoFee(null); setErroFee(""); }}
                          className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}
                          disabled={salvandoTaxa}
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          onClick={handleSalvarTaxaESeguir}
                          disabled={salvandoTaxa || !novaTaxaPercentual.trim()}
                          className="btn-primary"
                          style={{ padding: "5px 12px", fontSize: 12, opacity: salvandoTaxa || !novaTaxaPercentual.trim() ? 0.5 : 1 }}
                        >
                          {salvandoTaxa ? "Salvando..." : "Salvar taxa e continuar"}
                        </button>
                      </div>
                    </div>
                  )}

                  {modoResolucaoFee === "sem_taxa" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Justificativa (obrigatória) *
                      </label>
                      <textarea
                        value={justificativaSemTaxa}
                        onChange={(e) => setJustificativaSemTaxa(e.target.value)}
                        rows={2}
                        placeholder="Por que está finalizando sem configurar a taxa de R&S?"
                        className="input-field resize-none"
                      />
                      <div className="flex gap-2 justify-end mt-2">
                        <button
                          type="button"
                          onClick={() => setModoResolucaoFee(null)}
                          className="btn-outline" style={{ padding: "5px 12px", fontSize: 12 }}
                          disabled={enviando}
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmar}
                          disabled={!justificativaSemTaxa.trim() || enviando}
                          className="btn-primary"
                          style={{ padding: "5px 12px", fontSize: 12, background: "#DC2626", opacity: !justificativaSemTaxa.trim() || enviando ? 0.5 : 1 }}
                        >
                          {enviando ? "Salvando..." : "Confirmar sem taxa"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
