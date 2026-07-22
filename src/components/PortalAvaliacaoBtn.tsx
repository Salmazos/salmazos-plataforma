"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MOTIVOS_REPROVACAO_CLIENTE, OUTRO_MOTIVO_REPROVACAO } from "@/lib/motivos-reprovacao";
import CampoMoeda from "@/components/ui/CampoMoeda";

interface Props {
  encaminhamentoId: string;
  statusAtual: string;
  feedbackAtual: string;
  tipoServico?: string | null;
  feePercentual?: number | null;
  feePrazo?: string | null;
  vagaId?: string | null;
  cvId?: string | null;
}

const PERIODOS_EXP = ["30 dias", "45 dias", "90 dias"];

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}{required && " *"}
      </label>
      {children}
    </div>
  );
}

export default function PortalAvaliacaoBtn({
  encaminhamentoId,
  statusAtual,
  feedbackAtual,
  tipoServico,
  feePercentual,
  feePrazo,
  cvId,
}: Props) {
  const router = useRouter();
  const [modalAberto, setModalAberto] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState<"aprovado" | "reprovado" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [motivoSelecionado, setMotivoSelecionado] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);

  // Agendamento (fluxo leve e separado — só define a data/hora da entrevista,
  // não é uma avaliação de verdade ainda)
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [agendarData, setAgendarData] = useState("");
  const [agendarHora, setAgendarHora] = useState("");
  const [agendarSalvando, setAgendarSalvando] = useState(false);
  const [agendarErro, setAgendarErro] = useState("");
  const [agendarTentou, setAgendarTentou] = useState(false);

  // Admission fields
  const [admDataInicio, setAdmDataInicio] = useState("");
  const [admCargo, setAdmCargo] = useState("");
  const [admSalario, setAdmSalario] = useState("");
  const [admSetor, setAdmSetor] = useState("");
  const [admCentroCusto, setAdmCentroCusto] = useState("");
  const [admHorario, setAdmHorario] = useState("");
  const [admGestor, setAdmGestor] = useState("");
  const [admPeriodoExp, setAdmPeriodoExp] = useState("");
  const [admObservacoes, setAdmObservacoes] = useState("");
  const [admFuncao, setAdmFuncao] = useState("");
  const [admSalarioHora, setAdmSalarioHora] = useState("");
  const [admTurno, setAdmTurno] = useState("");
  const [admTempoContrato, setAdmTempoContrato] = useState("180 dias, prorrogável por mais 90 dias");
  const [admVt, setAdmVt] = useState<boolean | null>(null);
  const [admExameResp, setAdmExameResp] = useState("");
  const [admLocalIntegracao, setAdmLocalIntegracao] = useState("");
  const [admTelefone, setAdmTelefone] = useState("");

  if (statusAtual === "aprovado" || statusAtual === "reprovado") {
    return (
      <div
        className="rounded-2xl p-6 mb-6 text-center"
        style={{
          backgroundColor: statusAtual === "aprovado" ? "#DCFCE7" : "#FEE2E2",
          color: statusAtual === "aprovado" ? "#166534" : "#991B1B",
        }}
      >
        <p className="font-semibold text-lg">
          {statusAtual === "aprovado" ? "✓ Candidato aprovado" : "✗ Candidato reprovado"}
        </p>
        {feedbackAtual && (
          <p className="text-sm mt-2 opacity-75">&quot;{feedbackAtual}&quot;</p>
        )}
      </div>
    );
  }

  if (statusAtual !== "aguardando" && statusAtual !== "aguardando_agendamento_cliente") return null;

  const precisaAgendar = statusAtual === "aguardando_agendamento_cliente";

  const handleAbrir = (acao: "aprovado" | "reprovado") => {
    if (acao === "aprovado" && precisaAgendar) {
      setAgendarData("");
      setAgendarHora("");
      setAgendarErro("");
      setAgendarTentou(false);
      setAgendarAberto(true);
      return;
    }
    setAcaoPendente(acao);
    setFeedback("");
    setMotivoSelecionado("");
    setMotivoOutro("");
    setErro("");
    setTentouEnviar(false);
    setModalAberto(true);
  };

  const handleConfirmarAgendamento = async () => {
    setAgendarTentou(true);
    if (!agendarData || !agendarHora) {
      setAgendarErro("Informe a data e o horário.");
      return;
    }
    const dataHora = new Date(`${agendarData}T${agendarHora}:00`);
    if (Number.isNaN(dataHora.getTime()) || dataHora.getTime() <= Date.now()) {
      setAgendarErro("Escolha uma data e horário no futuro.");
      return;
    }
    setAgendarSalvando(true);
    setAgendarErro("");
    try {
      const res = await fetch("/api/portal/agendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encaminhamento_id: encaminhamentoId, data_entrevista: dataHora.toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAgendarErro(json.error ?? "Erro ao salvar.");
        return;
      }
      setAgendarAberto(false);
      router.refresh();
    } catch {
      setAgendarErro("Erro ao salvar. Tente novamente.");
    } finally {
      setAgendarSalvando(false);
    }
  };

  const isRS = tipoServico === "recrutamento_selecao";
  const isMOT = tipoServico === "mao_obra_temporaria";
  const isTerc = tipoServico === "terceirizacao";
  const isAprovacao = acaoPendente === "aprovado";
  const showAdmissao = isAprovacao && (isRS || isMOT || isTerc);
  const isOutroMotivo = motivoSelecionado === OUTRO_MOTIVO_REPROVACAO;
  const motivoValido = isOutroMotivo ? motivoOutro.trim().length > 0 : motivoSelecionado.trim().length > 0;

  const feeValor = isRS && feePercentual && admSalario
    ? (parseFloat(admSalario) * feePercentual / 100)
    : null;

  const validateRequired = (): string | null => {
    if (!isAprovacao) {
      if (!motivoValido) return isOutroMotivo ? "Descreva o motivo." : "Selecione o motivo da reprovação.";
      return null;
    }

    if (!feedback.trim()) return "Adicione um comentário.";

    if (isRS) {
      if (!admDataInicio) return "Informe a data de início.";
      if (!admCargo.trim()) return "Informe o cargo/função confirmada.";
      if (!admSalario) return "Informe o salário acordado.";
    } else if (isMOT) {
      if (!admDataInicio) return "Informe a data de início.";
      if (!admFuncao.trim()) return "Informe a função.";
      if (!admSetor.trim()) return "Informe o setor.";
      if (!admCentroCusto.trim()) return "Informe o centro de custo.";
      if (!admSalarioHora) return "Informe o salário por hora.";
      if (!admHorario.trim()) return "Informe o horário/turno.";
      if (!admTempoContrato.trim()) return "Informe o tempo de contrato.";
      if (!admTelefone.trim()) return "Informe o telefone do candidato.";
      if (admVt === null) return "Informe se utiliza Vale Transporte.";
      if (!admExameResp.trim()) return "Informe o responsável pelo exame admissional.";
    } else if (isTerc) {
      if (!admDataInicio) return "Informe a data de início.";
      if (!admFuncao.trim()) return "Informe a função/cargo.";
      if (!admSetor.trim()) return "Informe o setor.";
      if (!admCentroCusto.trim()) return "Informe o centro de custo.";
      if (!admSalario) return "Informe o salário.";
      if (!admHorario.trim()) return "Informe o horário/turno.";
      if (!admTelefone.trim()) return "Informe o telefone do candidato.";
      if (admVt === null) return "Informe se utiliza Vale Transporte.";
      if (!admExameResp.trim()) return "Informe o responsável pelo exame admissional.";
    }
    return null;
  };

  const handleConfirmar = async () => {
    setTentouEnviar(true);
    const validationErr = validateRequired();
    if (validationErr) { setErro(validationErr); return; }

    setSalvando(true);
    setErro("");
    try {
      const feedbackFinal = isAprovacao
        ? feedback
        : (isOutroMotivo ? `Outro motivo: ${motivoOutro.trim()}` : motivoSelecionado);
      const res = await fetch("/api/portal/avaliar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encaminhamento_id: encaminhamentoId,
          status: acaoPendente,
          feedback_cliente: feedbackFinal,
          ...(isAprovacao && cvId ? {
            cv_id: cvId,
            tipo_servico: tipoServico,
            admissao_data_inicio: admDataInicio || null,
            admissao_cargo: admCargo || null,
            admissao_salario: admSalario ? parseFloat(admSalario) : null,
            admissao_setor: admSetor || null,
            admissao_centro_custo: admCentroCusto || null,
            admissao_horario: admHorario || null,
            admissao_gestor: admGestor || null,
            admissao_periodo_experiencia: admPeriodoExp || null,
            admissao_observacoes: admObservacoes || null,
            admissao_funcao: admFuncao || null,
            admissao_salario_hora: admSalarioHora ? parseFloat(admSalarioHora) : null,
            admissao_turno: admTurno || null,
            admissao_tempo_contrato: admTempoContrato || null,
            admissao_vt: admVt,
            admissao_exame_responsavel: admExameResp || null,
            admissao_local_integracao: admLocalIntegracao || null,
            admissao_telefone_candidato: admTelefone || null,
          } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Erro ao salvar avaliação.");
        return;
      }
      setModalAberto(false);
      router.refresh();
    } catch {
      setErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const inv = { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" };
  const missing = (v: string | boolean | null) => tentouEnviar && (v === "" || v === null);

  return (
    <>
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
        <p className="section-title">Sua avaliação</p>
        <p className="text-sm text-gray-500 mb-4">
          {precisaAgendar
            ? "Escolha quando podemos enviar este candidato para entrevista com sua empresa."
            : "Avalie este candidato para nos ajudar a encontrar o perfil ideal para sua empresa."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => handleAbrir("aprovado")}
            className="flex-1 py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#16A34A" }}
          >
            {precisaAgendar ? "Confirmar Data da Entrevista" : "Aprovar candidato"}
          </button>
          <button
            onClick={() => handleAbrir("reprovado")}
            className="flex-1 py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#DC2626" }}
          >
            Reprovar candidato
          </button>
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div
              className="px-6 py-4 rounded-t-2xl text-white"
              style={{ background: isAprovacao ? "#065F46" : "#991B1B" }}
            >
              <h3 className="text-lg font-bold">
                {isAprovacao ? "Aprovar candidato" : "Reprovar candidato"}
              </h3>
              <p className="text-sm mt-0.5 opacity-75">
                Adicione {isAprovacao && showAdmissao ? "os dados para admissão e " : ""}um comentário para a equipe Salmazos.
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Section 1: Feedback / Motivo */}
              {isAprovacao ? (
                <Field label="Feedback" required>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="Ex: Perfil excelente, boa comunicação e experiência relevante..."
                    className="input-field resize-none w-full"
                    style={missing(feedback) ? inv : undefined}
                    autoFocus
                  />
                </Field>
              ) : (
                <>
                  <Field label="Motivo da reprovação" required>
                    <select
                      value={motivoSelecionado}
                      onChange={(e) => setMotivoSelecionado(e.target.value)}
                      className="input-field w-full"
                      style={tentouEnviar && !motivoSelecionado ? inv : undefined}
                      autoFocus
                    >
                      <option value="" disabled>Selecione o motivo...</option>
                      {MOTIVOS_REPROVACAO_CLIENTE.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </Field>

                  {isOutroMotivo && (
                    <Field label="Descreva o motivo" required>
                      <textarea
                        value={motivoOutro}
                        onChange={(e) => setMotivoOutro(e.target.value)}
                        rows={3}
                        placeholder="Descreva o motivo..."
                        className="input-field resize-none w-full"
                        style={tentouEnviar && !motivoOutro.trim() ? inv : undefined}
                      />
                    </Field>
                  )}
                </>
              )}

              {/* Section 2: Admission data */}
              {showAdmissao && (
                <div className="border-t pt-4 space-y-4">
                  <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <span>📋</span> Dados para Admissão
                  </p>

                  {/* ── R&S Fields ──────────────────────────────── */}
                  {isRS && (
                    <>
                      <Field label="Data de Início" required>
                        <input type="date" value={admDataInicio} onChange={(e) => setAdmDataInicio(e.target.value)}
                          className="input-field" style={missing(admDataInicio) ? inv : undefined} />
                      </Field>
                      <Field label="Cargo/Função Confirmada" required>
                        <input value={admCargo} onChange={(e) => setAdmCargo(e.target.value)}
                          placeholder="Ex: Analista de RH" className="input-field"
                          style={missing(admCargo) ? inv : undefined} />
                      </Field>
                      <Field label="Salário Acordado R$" required>
                        <CampoMoeda value={admSalario}
                          onChange={(v) => setAdmSalario(v > 0 ? String(v) : "")} placeholder="Ex: 3.500,00"
                          className="input-field" style={missing(admSalario) ? inv : undefined} />
                      </Field>
                      {feePercentual != null && (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "12px 14px" }}>
                          <p style={{ fontSize: 13, color: "#92400E", margin: 0, lineHeight: 1.7 }}>
                            <strong>Fee Salmazos:</strong> {feePercentual}%
                            {feeValor != null && <> = <strong>R$ {feeValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></>}
                            <br />
                            <strong>Prazo de pagamento:</strong> {feePrazo ?? "A definir"}
                            <br />
                            ✅ <strong>Garantia de reposição:</strong> 30 dias a partir da data de início
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Departamento/Setor">
                          <input value={admSetor} onChange={(e) => setAdmSetor(e.target.value)}
                            placeholder="Ex: Administrativo" className="input-field" />
                        </Field>
                        <Field label="Gestor Direto">
                          <input value={admGestor} onChange={(e) => setAdmGestor(e.target.value)}
                            placeholder="Nome do gestor" className="input-field" />
                        </Field>
                      </div>
                      <Field label="Período de Experiência">
                        <select value={admPeriodoExp} onChange={(e) => setAdmPeriodoExp(e.target.value)} className="input-field">
                          <option value="">Selecione...</option>
                          {PERIODOS_EXP.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </Field>
                    </>
                  )}

                  {/* ── MOT Fields ──────────────────────────────── */}
                  {isMOT && (
                    <>
                      <Field label="Data de Início" required>
                        <input type="date" value={admDataInicio} onChange={(e) => setAdmDataInicio(e.target.value)}
                          className="input-field" style={missing(admDataInicio) ? inv : undefined} />
                      </Field>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Função no Cliente" required>
                          <input value={admFuncao} onChange={(e) => setAdmFuncao(e.target.value)}
                            placeholder="Ex: Auxiliar de Produção" className="input-field"
                            style={missing(admFuncao) ? inv : undefined} />
                        </Field>
                        <Field label="Setor" required>
                          <input value={admSetor} onChange={(e) => setAdmSetor(e.target.value)}
                            placeholder="Ex: Produção" className="input-field"
                            style={missing(admSetor) ? inv : undefined} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Centro de Custo" required>
                          <input value={admCentroCusto} onChange={(e) => setAdmCentroCusto(e.target.value)}
                            placeholder="Ex: CC-0042" className="input-field"
                            style={missing(admCentroCusto) ? inv : undefined} />
                        </Field>
                        <Field label="Salário R$/hora" required>
                          <CampoMoeda value={admSalarioHora}
                            onChange={(v) => setAdmSalarioHora(v > 0 ? String(v) : "")} placeholder="Ex: 18,50"
                            className="input-field" style={missing(admSalarioHora) ? inv : undefined} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Horário/Turno" required>
                          <input value={admHorario} onChange={(e) => setAdmHorario(e.target.value)}
                            placeholder="Ex: 06h às 14h20" className="input-field"
                            style={missing(admHorario) ? inv : undefined} />
                        </Field>
                        <Field label="Tempo de Contrato" required>
                          <input value={admTempoContrato} onChange={(e) => setAdmTempoContrato(e.target.value)}
                            className="input-field" style={missing(admTempoContrato) ? inv : undefined} />
                        </Field>
                      </div>
                      <Field label="Telefone do Candidato" required>
                        <input value={admTelefone} onChange={(e) => setAdmTelefone(e.target.value)}
                          placeholder="(11) 99999-9999" className="input-field"
                          style={missing(admTelefone) ? inv : undefined} />
                      </Field>
                      <Field label="Vale Transporte?" required>
                        <div className="flex gap-4 mt-1">
                          {[true, false].map((v) => (
                            <label key={String(v)} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                              <input type="radio" name="vt" checked={admVt === v}
                                onChange={() => setAdmVt(v)} className="accent-black" />
                              {v ? "Sim" : "Não"}
                            </label>
                          ))}
                        </div>
                        {missing(admVt) && <p className="text-red-500 text-xs mt-1">Selecione uma opção.</p>}
                      </Field>
                      <Field label="Exame Admissional — Responsável" required>
                        <input value={admExameResp} onChange={(e) => setAdmExameResp(e.target.value)}
                          placeholder="Ex: Clínica MedTrab / RH do cliente" className="input-field"
                          style={missing(admExameResp) ? inv : undefined} />
                      </Field>
                      <Field label="Local/Data/Hora da Integração">
                        <input value={admLocalIntegracao} onChange={(e) => setAdmLocalIntegracao(e.target.value)}
                          placeholder="Ex: Portaria principal, 23/06 às 07h" className="input-field" />
                      </Field>
                    </>
                  )}

                  {/* ── Terceirização Fields ───────────────────── */}
                  {isTerc && (
                    <>
                      <Field label="Data de Início" required>
                        <input type="date" value={admDataInicio} onChange={(e) => setAdmDataInicio(e.target.value)}
                          className="input-field" style={missing(admDataInicio) ? inv : undefined} />
                      </Field>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Função/Cargo" required>
                          <input value={admFuncao} onChange={(e) => setAdmFuncao(e.target.value)}
                            placeholder="Ex: Auxiliar de Limpeza" className="input-field"
                            style={missing(admFuncao) ? inv : undefined} />
                        </Field>
                        <Field label="Setor" required>
                          <input value={admSetor} onChange={(e) => setAdmSetor(e.target.value)}
                            placeholder="Ex: Facilities" className="input-field"
                            style={missing(admSetor) ? inv : undefined} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Centro de Custo" required>
                          <input value={admCentroCusto} onChange={(e) => setAdmCentroCusto(e.target.value)}
                            placeholder="Ex: CC-0042" className="input-field"
                            style={missing(admCentroCusto) ? inv : undefined} />
                        </Field>
                        <Field label="Salário R$" required>
                          <CampoMoeda value={admSalario}
                            onChange={(v) => setAdmSalario(v > 0 ? String(v) : "")} placeholder="Ex: 1.800,00"
                            className="input-field" style={missing(admSalario) ? inv : undefined} />
                        </Field>
                      </div>
                      <Field label="Horário/Turno" required>
                        <input value={admHorario} onChange={(e) => setAdmHorario(e.target.value)}
                          placeholder="Ex: 06h às 14h20" className="input-field"
                          style={missing(admHorario) ? inv : undefined} />
                      </Field>
                      <Field label="Telefone do Candidato" required>
                        <input value={admTelefone} onChange={(e) => setAdmTelefone(e.target.value)}
                          placeholder="(11) 99999-9999" className="input-field"
                          style={missing(admTelefone) ? inv : undefined} />
                      </Field>
                      <Field label="Vale Transporte?" required>
                        <div className="flex gap-4 mt-1">
                          {[true, false].map((v) => (
                            <label key={String(v)} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                              <input type="radio" name="vt-terc" checked={admVt === v}
                                onChange={() => setAdmVt(v)} className="accent-black" />
                              {v ? "Sim" : "Não"}
                            </label>
                          ))}
                        </div>
                        {missing(admVt) && <p className="text-red-500 text-xs mt-1">Selecione uma opção.</p>}
                      </Field>
                      <Field label="Exame Admissional — Responsável" required>
                        <input value={admExameResp} onChange={(e) => setAdmExameResp(e.target.value)}
                          placeholder="Ex: Clínica MedTrab / RH do cliente" className="input-field"
                          style={missing(admExameResp) ? inv : undefined} />
                      </Field>
                      <Field label="Local/Data/Hora da Integração">
                        <input value={admLocalIntegracao} onChange={(e) => setAdmLocalIntegracao(e.target.value)}
                          placeholder="Ex: Portaria principal, 23/06 às 07h" className="input-field" />
                      </Field>
                    </>
                  )}

                  {/* Observações (all types) */}
                  <Field label="Observações">
                    <textarea value={admObservacoes} onChange={(e) => setAdmObservacoes(e.target.value)}
                      rows={2} placeholder="Observações adicionais..." className="input-field resize-none" />
                  </Field>
                </div>
              )}

              {erro && <p className="text-red-600 text-xs">{erro}</p>}

              <div className="flex gap-3 pt-2 border-t">
                <button
                  onClick={() => setModalAberto(false)}
                  className="flex-1 btn-outline py-2.5"
                  disabled={salvando}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmar}
                  disabled={salvando || (isAprovacao ? !feedback.trim() : !motivoValido)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: isAprovacao ? "#16A34A" : "#DC2626" }}
                >
                  {salvando ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {agendarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-4 rounded-t-2xl text-white" style={{ background: "#065F46" }}>
              <h3 className="text-lg font-bold">Confirmar Data da Entrevista</h3>
              <p className="text-sm mt-0.5 opacity-75">Escolha uma data e horário futuros para receber o candidato.</p>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Data" required>
                <input
                  type="date"
                  value={agendarData}
                  onChange={(e) => setAgendarData(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="input-field w-full"
                  style={agendarTentou && !agendarData ? inv : undefined}
                  autoFocus
                />
              </Field>
              <Field label="Horário" required>
                <input
                  type="time"
                  value={agendarHora}
                  onChange={(e) => setAgendarHora(e.target.value)}
                  className="input-field w-full"
                  style={agendarTentou && !agendarHora ? inv : undefined}
                />
              </Field>

              {agendarErro && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {agendarErro}
                </p>
              )}

              <div className="flex gap-3 pt-2 border-t">
                <button
                  onClick={() => setAgendarAberto(false)}
                  className="flex-1 btn-outline py-2.5"
                  disabled={agendarSalvando}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarAgendamento}
                  disabled={agendarSalvando}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "#16A34A" }}
                >
                  {agendarSalvando ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
