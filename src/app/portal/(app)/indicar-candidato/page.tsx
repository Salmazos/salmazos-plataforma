"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createPortalBrowserClient } from "@/lib/supabase/client";
import CampoMoeda from "@/components/ui/CampoMoeda";
import CampoTelefone from "@/components/ui/CampoTelefone";

interface VagaAtiva {
  id: string;
  titulo: string;
  tipo_servico: string;
  cidade: string | null;
  estado: string | null;
}

const PERIODOS_EXP = ["30 dias", "45 dias", "90 dias"];
const TURNO_OPCOES = [
  "Turno A", "Turno B", "Turno C", "Turno D",
  "Horário Administrativo", "Escala 6x1", "Escala 6x2", "Escala Fixa", "Outro",
];
const TURNO_OPCOES_MOT = ["Turno A", "Turno B", "Turno C", "Turno D", "Horário Administrativo", "Outro"];
const ESCALA_OPCOES_MOT = ["6x1", "6x2", "Fixa", "Outro"];

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.05em",
  display: "block", marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 8,
  padding: "9px 12px", fontSize: 14, color: "#111827",
  outline: "none", width: "100%", boxSizing: "border-box",
};
const inv: React.CSSProperties = { borderColor: "#EF4444", boxShadow: "0 0 0 1px #EF4444" };

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}{required && " *"}</label>
      {children}
    </div>
  );
}

function formatarHoraTexto(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${h}h${m}`;
}
function formatarDataTexto(iso: string): string {
  return iso.split("-").reverse().join("/");
}

export default function IndicarCandidatoPage() {
  const [carregando, setCarregando] = useState(true);
  const [vagas, setVagas] = useState<VagaAtiva[]>([]);
  const [vagaId, setVagaId] = useState("");
  const [candidatoNome, setCandidatoNome] = useState("");
  const [candidatoTelefone, setCandidatoTelefone] = useState("");
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputCurriculoRef = useRef<HTMLInputElement>(null);

  const [admDataInicio, setAdmDataInicio] = useState("");
  const [admSalario, setAdmSalario] = useState("");
  const [admSetor, setAdmSetor] = useState("");
  const [admCentroCusto, setAdmCentroCusto] = useState("");
  const [admGestor, setAdmGestor] = useState("");
  const [admPeriodoExp, setAdmPeriodoExp] = useState("");
  const [admObservacoes, setAdmObservacoes] = useState("");
  const [admFuncao, setAdmFuncao] = useState("");
  const [admSalarioTipo, setAdmSalarioTipo] = useState<"horista" | "mensalista">("horista");
  const [admSalarioHora, setAdmSalarioHora] = useState("");
  const [admTempoContrato, setAdmTempoContrato] = useState("180 dias, prorrogável por mais 90 dias");
  const [admVt, setAdmVt] = useState<boolean | null>(null);
  const [admExameResp, setAdmExameResp] = useState("");
  const [admHorarioEntrada, setAdmHorarioEntrada] = useState("");
  const [admHorarioSaida, setAdmHorarioSaida] = useState("");
  const [admTurnoSelecionado, setAdmTurnoSelecionado] = useState("");
  const [admTurnoOutro, setAdmTurnoOutro] = useState("");
  const [admEscalaSelecionada, setAdmEscalaSelecionada] = useState("");
  const [admEscalaOutro, setAdmEscalaOutro] = useState("");
  const [admIntegracaoLocal, setAdmIntegracaoLocal] = useState("");
  const [admIntegracaoData, setAdmIntegracaoData] = useState("");
  const [admIntegracaoHora, setAdmIntegracaoHora] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portal/vagas-ativas");
        const json = await res.json();
        setVagas(json.data ?? []);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const vaga = vagas.find((v) => v.id === vagaId) ?? null;
  const isRS = vaga?.tipo_servico === "recrutamento_selecao";
  const isMOT = vaga?.tipo_servico === "mao_obra_temporaria";
  const isTerc = vaga?.tipo_servico === "terceirizacao";
  const precisaHorarioEstruturado = isMOT || isTerc;
  const missing = (v: string | boolean | null) => tentouEnviar && (v === "" || v === null);

  const turnoFinal = admTurnoSelecionado === "Outro" ? admTurnoOutro.trim() : admTurnoSelecionado;
  const escalaFinal = admEscalaSelecionada === "Outro" ? admEscalaOutro.trim() : admEscalaSelecionada;
  const horarioComposto = admHorarioEntrada && admHorarioSaida && turnoFinal
    ? `${turnoFinal}, ${formatarHoraTexto(admHorarioEntrada)} às ${formatarHoraTexto(admHorarioSaida)}`
    : "";
  const integracaoPreenchidaParcialmente = Boolean(
    (admIntegracaoLocal.trim() || admIntegracaoData || admIntegracaoHora) &&
    !(admIntegracaoLocal.trim() && admIntegracaoData && admIntegracaoHora)
  );
  const integracaoComposta = admIntegracaoLocal.trim() && admIntegracaoData && admIntegracaoHora
    ? `${admIntegracaoLocal.trim()}, ${formatarDataTexto(admIntegracaoData)} às ${admIntegracaoHora}`
    : "";

  const validar = (): string | null => {
    if (!vagaId) return "Selecione a vaga.";
    if (!candidatoNome.trim()) return "Informe o nome do candidato.";
    if (!candidatoTelefone.trim()) return "Informe o telefone do candidato.";

    // Mesmas obrigatoriedades por tipo de serviço do fluxo normal de aprovação
    // (PortalAvaliacaoBtn.validateRequired) — regra de negócio, não de schema.
    if (isRS) {
      if (!admDataInicio) return "Informe a data de início.";
      if (!admFuncao.trim()) return "Informe a função confirmada.";
      if (!admSalario) return "Informe o salário acordado.";
    } else if (isMOT) {
      if (!admDataInicio) return "Informe a data de início.";
      if (!admFuncao.trim()) return "Informe a função.";
      if (!admSetor.trim()) return "Informe o setor.";
      if (!admCentroCusto.trim()) return "Informe o centro de custo.";
      if (admSalarioTipo === "horista" ? !admSalarioHora : !admSalario) return "Informe o salário.";
      if (!admHorarioEntrada || !admHorarioSaida) return "Informe o horário de entrada e saída.";
      if (!admTurnoSelecionado) return "Selecione o turno.";
      if (admTurnoSelecionado === "Outro" && !admTurnoOutro.trim()) return "Especifique o turno.";
      if (!admEscalaSelecionada) return "Selecione a escala.";
      if (admEscalaSelecionada === "Outro" && !admEscalaOutro.trim()) return "Especifique a escala.";
      if (!admTempoContrato.trim()) return "Informe o tempo de contrato.";
      if (admVt === null) return "Informe se utiliza Vale Transporte.";
      if (!admExameResp.trim()) return "Informe o responsável pelo exame admissional.";
    } else if (isTerc) {
      if (!admDataInicio) return "Informe a data de início.";
      if (!admFuncao.trim()) return "Informe a função/cargo.";
      if (!admSetor.trim()) return "Informe o setor.";
      if (!admCentroCusto.trim()) return "Informe o centro de custo.";
      if (!admSalario) return "Informe o salário.";
      if (!admHorarioEntrada || !admHorarioSaida) return "Informe o horário de entrada e saída.";
      if (!admTurnoSelecionado) return "Selecione o turno.";
      if (admTurnoSelecionado === "Outro" && !admTurnoOutro.trim()) return "Especifique o turno.";
      if (admVt === null) return "Informe se utiliza Vale Transporte.";
      if (!admExameResp.trim()) return "Informe o responsável pelo exame admissional.";
    }

    if (precisaHorarioEstruturado && integracaoPreenchidaParcialmente) {
      return "Preencha local, data e hora da integração, ou deixe os três em branco.";
    }
    return null;
  };

  const handleEnviar = async () => {
    setTentouEnviar(true);
    const erroValidacao = validar();
    if (erroValidacao) { setErro(erroValidacao); return; }

    setEnviando(true);
    setErro("");
    try {
      let curriculo_url: string | null = null;
      if (curriculo) {
        const supabase = createPortalBrowserClient();
        const ext = curriculo.name.split(".").pop()?.toLowerCase() ?? "pdf";
        const contentType =
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
          ext === "png" ? "image/png" :
          ext === "doc" || ext === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("curriculos")
          .upload(fileName, curriculo, { contentType });
        if (uploadErr) throw new Error("Falha ao enviar o currículo. Tente novamente.");
        curriculo_url = fileName;
      }

      const res = await fetch("/api/portal/indicar-candidato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaga_id: vagaId,
          candidato_nome: candidatoNome.trim(),
          candidato_telefone: candidatoTelefone.trim(),
          curriculo_url,
          admissao_data_inicio: admDataInicio || null,
          admissao_salario: admSalario ? parseFloat(admSalario) : null,
          admissao_salario_hora: admSalarioHora ? parseFloat(admSalarioHora) : null,
          admissao_setor: admSetor || null,
          admissao_centro_custo: admCentroCusto || null,
          admissao_horario: precisaHorarioEstruturado ? (horarioComposto || null) : null,
          admissao_gestor: admGestor || null,
          admissao_periodo_experiencia: admPeriodoExp || null,
          admissao_funcao: admFuncao || null,
          admissao_turno: precisaHorarioEstruturado ? (turnoFinal || null) : null,
          admissao_escala: isMOT ? (escalaFinal || null) : null,
          admissao_tempo_contrato: admTempoContrato || null,
          admissao_vt: admVt,
          admissao_exame_responsavel: admExameResp || null,
          admissao_local_integracao: integracaoComposta || null,
          admissao_observacoes: admObservacoes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro ao enviar."); return; }
      setSucesso(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  if (sucesso) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="text-5xl mb-4">{"✅"}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Indicação enviada!</h2>
          <p className="text-sm text-gray-500 mb-6">
            A equipe Salmazos vai revisar e entrar em contato com o candidato pra completar
            o registro.
          </p>
          <Link href="/portal" className="inline-block px-6 py-2.5 bg-black text-[#FFD700] rounded-xl font-semibold text-sm">
            Voltar ao painel
          </Link>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Indicar Candidato para Registro</h1>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vaga</p>
          {vagas.length === 0 ? (
            <p className="text-sm text-gray-500">
              Você não tem nenhuma vaga aberta no momento. Solicite uma vaga primeiro.
            </p>
          ) : (
            <Field label="Selecione a vaga" required>
              <select
                value={vagaId}
                onChange={(e) => setVagaId(e.target.value)}
                style={{ ...inputStyle, background: "#fff", cursor: "pointer", ...(tentouEnviar && !vagaId ? inv : {}) }}
              >
                <option value="">Selecione...</option>
                {vagas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.titulo}{v.cidade ? ` — ${v.cidade}${v.estado ? `/${v.estado}` : ""}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {vaga && (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Candidato</p>
              <Field label="Nome completo" required>
                <input value={candidatoNome} onChange={(e) => setCandidatoNome(e.target.value)}
                  placeholder="Nome do candidato" style={{ ...inputStyle, ...(missing(candidatoNome.trim() || null) ? inv : {}) }} />
              </Field>
              <Field label="Telefone" required>
                <CampoTelefone value={candidatoTelefone} onChange={setCandidatoTelefone}
                  placeholder="(11) 99999-9999" style={{ ...inputStyle, ...(missing(candidatoTelefone.trim() || null) ? inv : {}) }} />
              </Field>
              <Field label="Currículo">
                {/* Arrastar e soltar ou botão — mesmo padrão da candidatura pública
                    (FormCandidaturaVagaPublica). Continua sem bloquear o envio sem currículo. */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastando(false);
                    const arquivo = e.dataTransfer.files?.[0];
                    if (arquivo) setCurriculo(arquivo);
                  }}
                  style={{
                    border: `2px dashed ${curriculo || arrastando ? "#FFD700" : "#D1D5DB"}`,
                    borderRadius: 10,
                    padding: "20px 16px",
                    textAlign: "center",
                    backgroundColor: arrastando ? "rgba(255,215,0,0.08)" : curriculo ? "rgba(255,215,0,0.04)" : "#F9FAFB",
                    transition: "border-color 0.2s ease, background-color 0.2s ease",
                  }}
                >
                  <input
                    ref={inputCurriculoRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => { setCurriculo(e.target.files?.[0] ?? null); e.target.value = ""; }}
                    style={{ display: "none" }}
                  />
                  {curriculo ? (
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{"📎"} {curriculo.name}</span>
                      <span className="text-xs text-gray-400">{(curriculo.size / 1024 / 1024).toFixed(2)} MB</span>
                      <button type="button" onClick={() => setCurriculo(null)} className="text-xs font-semibold text-red-600 hover:underline">
                        Remover
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 mb-2">Arraste o arquivo aqui ou</p>
                      <button
                        type="button"
                        onClick={() => inputCurriculoRef.current?.click()}
                        className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Anexar arquivo
                      </button>
                      <p className="text-xs text-gray-400 mt-2">PDF, Word ou imagem</p>
                    </>
                  )}
                </div>
              </Field>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <span>📋</span> Dados para Admissão
              </p>

              {isRS && (
                <>
                  <Field label="Data de Início" required>
                    <input type="date" value={admDataInicio} onChange={(e) => setAdmDataInicio(e.target.value)}
                      style={{ ...inputStyle, ...(missing(admDataInicio) ? inv : {}) }} />
                  </Field>
                  <Field label="Função" required>
                    <input value={admFuncao} onChange={(e) => setAdmFuncao(e.target.value)}
                      placeholder="Ex: Analista de RH" style={{ ...inputStyle, ...(missing(admFuncao) ? inv : {}) }} />
                  </Field>
                  <Field label="Salário Acordado R$" required>
                    <CampoMoeda value={admSalario} onChange={(v) => setAdmSalario(v > 0 ? String(v) : "")}
                      placeholder="Ex: 3.500,00" style={{ ...inputStyle, ...(missing(admSalario) ? inv : {}) }} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Departamento/Setor">
                      <input value={admSetor} onChange={(e) => setAdmSetor(e.target.value)} placeholder="Ex: Administrativo" style={inputStyle} />
                    </Field>
                    <Field label="Gestor Direto">
                      <input value={admGestor} onChange={(e) => setAdmGestor(e.target.value)} placeholder="Nome do gestor" style={inputStyle} />
                    </Field>
                  </div>
                  <Field label="Período de Experiência">
                    <select value={admPeriodoExp} onChange={(e) => setAdmPeriodoExp(e.target.value)} style={{ ...inputStyle, background: "#fff", cursor: "pointer" }}>
                      <option value="">Selecione...</option>
                      {PERIODOS_EXP.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                </>
              )}

              {isMOT && (
                <>
                  <Field label="Data de Início" required>
                    <input type="date" value={admDataInicio} onChange={(e) => setAdmDataInicio(e.target.value)}
                      style={{ ...inputStyle, ...(missing(admDataInicio) ? inv : {}) }} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Função" required>
                      <input value={admFuncao} onChange={(e) => setAdmFuncao(e.target.value)}
                        placeholder="Ex: Auxiliar de Produção" style={{ ...inputStyle, ...(missing(admFuncao) ? inv : {}) }} />
                    </Field>
                    <Field label="Setor" required>
                      <input value={admSetor} onChange={(e) => setAdmSetor(e.target.value)}
                        placeholder="Ex: Produção" style={{ ...inputStyle, ...(missing(admSetor) ? inv : {}) }} />
                    </Field>
                  </div>
                  <Field label="Centro de Custo" required>
                    <input value={admCentroCusto} onChange={(e) => setAdmCentroCusto(e.target.value)}
                      placeholder="Ex: CC-0042" style={{ ...inputStyle, ...(missing(admCentroCusto) ? inv : {}) }} />
                  </Field>
                  <Field label="Tipo de Salário" required>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setAdmSalarioTipo("horista"); setAdmSalario(""); }}
                        className="px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-all"
                        style={admSalarioTipo === "horista"
                          ? { backgroundColor: "#111827", color: "#FFD700", borderColor: "#111827" }
                          : { backgroundColor: "#ffffff", color: "#6b7280", borderColor: "#e5e7eb" }}>
                        Horista
                      </button>
                      <button type="button" onClick={() => { setAdmSalarioTipo("mensalista"); setAdmSalarioHora(""); }}
                        className="px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-all"
                        style={admSalarioTipo === "mensalista"
                          ? { backgroundColor: "#111827", color: "#FFD700", borderColor: "#111827" }
                          : { backgroundColor: "#ffffff", color: "#6b7280", borderColor: "#e5e7eb" }}>
                        Mensalista
                      </button>
                    </div>
                  </Field>
                  {admSalarioTipo === "horista" ? (
                    <Field label="Salário R$/hora" required>
                      <CampoMoeda value={admSalarioHora} onChange={(v) => setAdmSalarioHora(v > 0 ? String(v) : "")}
                        placeholder="Ex: 18,50" style={{ ...inputStyle, ...(missing(admSalarioHora) ? inv : {}) }} />
                    </Field>
                  ) : (
                    <Field label="Salário mensal" required>
                      <CampoMoeda value={admSalario} onChange={(v) => setAdmSalario(v > 0 ? String(v) : "")}
                        placeholder="Ex: 1.800,00" style={{ ...inputStyle, ...(missing(admSalario) ? inv : {}) }} />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Entrada" required>
                      <input type="time" value={admHorarioEntrada} onChange={(e) => setAdmHorarioEntrada(e.target.value)}
                        style={{ ...inputStyle, ...(missing(admHorarioEntrada) ? inv : {}) }} />
                    </Field>
                    <Field label="Saída" required>
                      <input type="time" value={admHorarioSaida} onChange={(e) => setAdmHorarioSaida(e.target.value)}
                        style={{ ...inputStyle, ...(missing(admHorarioSaida) ? inv : {}) }} />
                    </Field>
                  </div>
                  <Field label="Turno" required>
                    <select value={admTurnoSelecionado} onChange={(e) => setAdmTurnoSelecionado(e.target.value)}
                      style={{ ...inputStyle, background: "#fff", cursor: "pointer", ...(missing(admTurnoSelecionado) ? inv : {}) }}>
                      <option value="" disabled>Selecione...</option>
                      {TURNO_OPCOES_MOT.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  {admTurnoSelecionado === "Outro" && (
                    <Field label="Especifique o turno" required>
                      <input value={admTurnoOutro} onChange={(e) => setAdmTurnoOutro(e.target.value)}
                        placeholder="Ex: Turno E" style={{ ...inputStyle, ...(tentouEnviar && !admTurnoOutro.trim() ? inv : {}) }} />
                    </Field>
                  )}
                  <Field label="Escala" required>
                    <select value={admEscalaSelecionada} onChange={(e) => setAdmEscalaSelecionada(e.target.value)}
                      style={{ ...inputStyle, background: "#fff", cursor: "pointer", ...(missing(admEscalaSelecionada) ? inv : {}) }}>
                      <option value="" disabled>Selecione...</option>
                      {ESCALA_OPCOES_MOT.map((es) => <option key={es} value={es}>{es}</option>)}
                    </select>
                  </Field>
                  {admEscalaSelecionada === "Outro" && (
                    <Field label="Especifique a escala" required>
                      <input value={admEscalaOutro} onChange={(e) => setAdmEscalaOutro(e.target.value)}
                        placeholder="Ex: 5x2" style={{ ...inputStyle, ...(tentouEnviar && !admEscalaOutro.trim() ? inv : {}) }} />
                    </Field>
                  )}
                  <Field label="Tempo de Contrato" required>
                    <input value={admTempoContrato} onChange={(e) => setAdmTempoContrato(e.target.value)}
                      style={{ ...inputStyle, ...(missing(admTempoContrato) ? inv : {}) }} />
                  </Field>
                  <Field label="Vale Transporte?" required>
                    <div className="flex gap-4 mt-1">
                      {[true, false].map((v) => (
                        <label key={String(v)} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                          <input type="radio" name="vt" checked={admVt === v} onChange={() => setAdmVt(v)} className="accent-black" />
                          {v ? "Sim" : "Não"}
                        </label>
                      ))}
                    </div>
                    {missing(admVt) && <p className="text-red-500 text-xs mt-1">Selecione uma opção.</p>}
                  </Field>
                  <Field label="Exame Admissional — Responsável" required>
                    <input value={admExameResp} onChange={(e) => setAdmExameResp(e.target.value)}
                      placeholder="Ex: Clínica MedTrab / RH do cliente" style={{ ...inputStyle, ...(missing(admExameResp) ? inv : {}) }} />
                  </Field>
                  <Field label="Local/Data/Hora da Integração">
                    <div className="grid grid-cols-3 gap-2">
                      <input value={admIntegracaoLocal} onChange={(e) => setAdmIntegracaoLocal(e.target.value)} placeholder="Ex: Portaria" style={inputStyle} />
                      <input type="date" value={admIntegracaoData} onChange={(e) => setAdmIntegracaoData(e.target.value)} style={inputStyle} />
                      <input type="time" value={admIntegracaoHora} onChange={(e) => setAdmIntegracaoHora(e.target.value)} style={inputStyle} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Preencha os três campos, ou deixe todos em branco.</p>
                  </Field>
                </>
              )}

              {isTerc && (
                <>
                  <Field label="Data de Início" required>
                    <input type="date" value={admDataInicio} onChange={(e) => setAdmDataInicio(e.target.value)}
                      style={{ ...inputStyle, ...(missing(admDataInicio) ? inv : {}) }} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Função" required>
                      <input value={admFuncao} onChange={(e) => setAdmFuncao(e.target.value)}
                        placeholder="Ex: Auxiliar de Limpeza" style={{ ...inputStyle, ...(missing(admFuncao) ? inv : {}) }} />
                    </Field>
                    <Field label="Setor" required>
                      <input value={admSetor} onChange={(e) => setAdmSetor(e.target.value)}
                        placeholder="Ex: Facilities" style={{ ...inputStyle, ...(missing(admSetor) ? inv : {}) }} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Centro de Custo" required>
                      <input value={admCentroCusto} onChange={(e) => setAdmCentroCusto(e.target.value)}
                        placeholder="Ex: CC-0042" style={{ ...inputStyle, ...(missing(admCentroCusto) ? inv : {}) }} />
                    </Field>
                    <Field label="Salário R$" required>
                      <CampoMoeda value={admSalario} onChange={(v) => setAdmSalario(v > 0 ? String(v) : "")}
                        placeholder="Ex: 1.800,00" style={{ ...inputStyle, ...(missing(admSalario) ? inv : {}) }} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Entrada" required>
                      <input type="time" value={admHorarioEntrada} onChange={(e) => setAdmHorarioEntrada(e.target.value)}
                        style={{ ...inputStyle, ...(missing(admHorarioEntrada) ? inv : {}) }} />
                    </Field>
                    <Field label="Saída" required>
                      <input type="time" value={admHorarioSaida} onChange={(e) => setAdmHorarioSaida(e.target.value)}
                        style={{ ...inputStyle, ...(missing(admHorarioSaida) ? inv : {}) }} />
                    </Field>
                  </div>
                  <Field label="Turno" required>
                    <select value={admTurnoSelecionado} onChange={(e) => setAdmTurnoSelecionado(e.target.value)}
                      style={{ ...inputStyle, background: "#fff", cursor: "pointer", ...(missing(admTurnoSelecionado) ? inv : {}) }}>
                      <option value="" disabled>Selecione...</option>
                      {TURNO_OPCOES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  {admTurnoSelecionado === "Outro" && (
                    <Field label="Especifique o turno" required>
                      <input value={admTurnoOutro} onChange={(e) => setAdmTurnoOutro(e.target.value)}
                        placeholder="Ex: Turno E" style={{ ...inputStyle, ...(tentouEnviar && !admTurnoOutro.trim() ? inv : {}) }} />
                    </Field>
                  )}
                  <Field label="Vale Transporte?" required>
                    <div className="flex gap-4 mt-1">
                      {[true, false].map((v) => (
                        <label key={String(v)} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                          <input type="radio" name="vt-terc" checked={admVt === v} onChange={() => setAdmVt(v)} className="accent-black" />
                          {v ? "Sim" : "Não"}
                        </label>
                      ))}
                    </div>
                    {missing(admVt) && <p className="text-red-500 text-xs mt-1">Selecione uma opção.</p>}
                  </Field>
                  <Field label="Exame Admissional — Responsável" required>
                    <input value={admExameResp} onChange={(e) => setAdmExameResp(e.target.value)}
                      placeholder="Ex: Clínica MedTrab / RH do cliente" style={{ ...inputStyle, ...(missing(admExameResp) ? inv : {}) }} />
                  </Field>
                  <Field label="Local/Data/Hora da Integração">
                    <div className="grid grid-cols-3 gap-2">
                      <input value={admIntegracaoLocal} onChange={(e) => setAdmIntegracaoLocal(e.target.value)} placeholder="Ex: Portaria" style={inputStyle} />
                      <input type="date" value={admIntegracaoData} onChange={(e) => setAdmIntegracaoData(e.target.value)} style={inputStyle} />
                      <input type="time" value={admIntegracaoHora} onChange={(e) => setAdmIntegracaoHora(e.target.value)} style={inputStyle} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Preencha os três campos, ou deixe todos em branco.</p>
                  </Field>
                </>
              )}

              <Field label="Observações">
                <textarea value={admObservacoes} onChange={(e) => setAdmObservacoes(e.target.value)}
                  rows={2} placeholder="Observações adicionais..." style={{ ...inputStyle, resize: "vertical" }} />
              </Field>
            </div>
          </>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
            {erro}
          </div>
        )}

        {vaga && (
          <button
            onClick={handleEnviar}
            disabled={enviando}
            className="w-full py-3.5 rounded-xl font-bold text-base transition-all disabled:opacity-60"
            style={{ backgroundColor: "#000", color: "#FFD700" }}
          >
            {enviando ? "Enviando..." : "Enviar Indicação →"}
          </button>
        )}
      </div>
    </div>
  );
}
