"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createPortalBrowserClient } from "@/lib/supabase/client";
import CampoTelefone from "@/components/ui/CampoTelefone";
import BlocoDadosAdmissao from "@/components/BlocoDadosAdmissao";
import { erroDiasTeste } from "@/components/CampoDiasTeste";
import { mensagemErrosAdmissao, validarCamposAdmissao } from "@/lib/admissaoCamposPadrao";
import { faltandoObrigatorios } from "@/lib/admissaoObrigatorios";
import { colunasDeDados, comHorario, dadosAoTrocarTipo, dadosVazios, integracaoPreenchidaParcialmente } from "@/lib/admissaoForm";
import { MOSTRAR_DIA_TESTE_NO_PORTAL } from "@/lib/diaTestePortal";

interface VagaAtiva {
  id: string;
  titulo: string;
  tipo_servico: string;
  cidade: string | null;
  estado: string | null;
}

// Opção do seletor "A Salmazos direciona (sem vaga)": a indicação nasce sem vaga e o analista direciona ou cria a vaga. Sempre disponível.
const SEM_VAGA = "__sem_vaga__";
const TIPOS_SEM_VAGA = [
  { valor: "mao_obra_temporaria", rotulo: "Mão de Obra Temporária (MOT)" },
  { valor: "terceirizacao", rotulo: "Terceirização" },
  { valor: "recrutamento_selecao", rotulo: "Recrutamento e Seleção (R&S)" },
];

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

export default function IndicarCandidatoPage() {
  const [carregando, setCarregando] = useState(true);
  const [vagas, setVagas] = useState<VagaAtiva[]>([]);
  const [vagaId, setVagaId] = useState("");
  const [tipoSemVaga, setTipoSemVaga] = useState("");
  const [avisoDuplicada, setAvisoDuplicada] = useState(false);
  const [candidatoNome, setCandidatoNome] = useState("");
  const [candidatoTelefone, setCandidatoTelefone] = useState("");
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputCurriculoRef = useRef<HTMLInputElement>(null);

  const [dados, setDados] = useState(() => dadosVazios(null));

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
        // Sem nenhuma vaga aberta a única opção é "A Salmazos direciona": já vem selecionada.
        if ((json.data ?? []).length === 0) setVagaId(SEM_VAGA);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const semVaga = vagaId === SEM_VAGA;
  const vaga = vagas.find((v) => v.id === vagaId) ?? null;
  // Tipo de serviço: da vaga escolhida ou, no sem vaga, o que o cliente escolheu para a indicação. O bloco "Dados para Admissão" é o mesmo.
  const tipoServico = vaga ? vaga.tipo_servico : semVaga ? tipoSemVaga || null : null;
  const horarioEstruturado = comHorario(tipoServico);

  // Trocar de vaga/tipo refaz o que depende do tipo (listas de turno e escala, tempo de contrato) e mantém o resto.
  const trocarTipo = (novoTipo: string | null) => setDados((d) => dadosAoTrocarTipo(d, novoTipo));
  const escolherVaga = (id: string) => {
    setVagaId(id);
    trocarTipo(vagas.find((v) => v.id === id)?.tipo_servico ?? (id === SEM_VAGA ? tipoSemVaga || null : null));
  };
  const escolherTipoSemVaga = (tipo: string) => {
    setTipoSemVaga(tipo);
    trocarTipo(tipo || null);
  };
  const missing = (v: string | boolean | null) => tentouEnviar && (v === "" || v === null);

  const validar = (): string | null => {
    if (!vagaId) return "Selecione a vaga.";
    if (!candidatoNome.trim()) return "Informe o nome do candidato.";
    if (!candidatoTelefone.trim()) return "Informe o telefone do candidato.";
    if (semVaga) {
      if (!tipoSemVaga) return "Selecione o tipo de serviço.";
      if (!dados.funcao.trim()) return "Informe o cargo/função do candidato.";
    }

    // Mesmas obrigatoriedades por tipo nos dois modos (módulo único, o mesmo que o servidor usa no sem vaga).
    const colunas = colunasDeDados(dados, tipoServico);
    const falta = faltandoObrigatorios(tipoServico, colunas as Parameters<typeof faltandoObrigatorios>[1]);
    if (falta.length > 0) return falta[0];
    const formato = validarCamposAdmissao({
      admissao_salario: colunas.admissao_salario as number | null, admissao_salario_hora: colunas.admissao_salario_hora as number | null,
      admissao_centro_custo: colunas.admissao_centro_custo as string | null, admissao_horario: colunas.admissao_horario as string | null,
      admissao_turno: colunas.admissao_turno as string | null, admissao_escala: colunas.admissao_escala as string | null,
      admissao_tempo_contrato: colunas.admissao_tempo_contrato as string | null,
    });
    if (formato.length > 0) return mensagemErrosAdmissao(formato);
    if (horarioEstruturado) {
      if (MOSTRAR_DIA_TESTE_NO_PORTAL) { const e = erroDiasTeste(dados.dias_teste); if (e) return e; }
      if (integracaoPreenchidaParcialmente(dados)) return "Preencha local, data e hora da integração, ou deixe os três em branco.";
    }
    return null;
  };

  const handleEnviar = async () => {
    setTentouEnviar(true);
    const erroValidacao = validar();
    if (erroValidacao) {
      setErro(erroValidacao);
      // Erro do dia(s) de teste: leva o usuário até o campo (ele fica no fim do bloco, fora da vista).
      if (MOSTRAR_DIA_TESTE_NO_PORTAL && horarioEstruturado && erroValidacao === erroDiasTeste(dados.dias_teste)) {
        document.getElementById("campo-dias-teste")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

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
          vaga_id: semVaga ? null : vagaId,
          ...(semVaga ? { tipo_servico: tipoSemVaga } : {}),
          candidato_nome: candidatoNome.trim(),
          candidato_telefone: candidatoTelefone.trim(),
          curriculo_url,
          ...colunasDeDados(dados, tipoServico),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error ?? "Erro ao enviar."); return; }
      setAvisoDuplicada(json.aviso_duplicada === true);
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
            {semVaga
              ? "A equipe Salmazos vai analisar a indicação e direcionar para uma vaga. Isso não cria vaga nem garante a contratação."
              : "A equipe Salmazos vai revisar e entrar em contato com o candidato pra completar o registro."}
          </p>
          {avisoDuplicada && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
              Atenção: você já tem outra indicação em análise com este mesmo telefone. A indicação foi enviada mesmo assim; a Salmazos vai conferir.
            </p>
          )}
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
          {vagas.length === 0 && (
            <p className="text-sm text-gray-500">
              Você não tem nenhuma vaga aberta no momento. Pode indicar mesmo assim: a Salmazos direciona o candidato para uma vaga.
            </p>
          )}
          <Field label="Selecione a vaga" required>
            <select
              value={vagaId}
              onChange={(e) => escolherVaga(e.target.value)}
              style={{ ...inputStyle, background: "#fff", cursor: "pointer", ...(tentouEnviar && !vagaId ? inv : {}) }}
            >
              <option value="">Selecione...</option>
              <option value={SEM_VAGA}>A Salmazos direciona (sem vaga)</option>
              {vagas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titulo}{v.cidade ? ` — ${v.cidade}${v.estado ? `/${v.estado}` : ""}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {(vaga || semVaga) && (
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

            {semVaga && (
              <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sobre a indicação</p>
                <Field label="Tipo de serviço" required>
                  <select value={tipoSemVaga} onChange={(e) => escolherTipoSemVaga(e.target.value)}
                    style={{ ...inputStyle, background: "#fff", cursor: "pointer", ...(tentouEnviar && !tipoSemVaga ? inv : {}) }}>
                    <option value="">Selecione...</option>
                    {TIPOS_SEM_VAGA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </select>
                </Field>
                {/* Um campo só: é a "função" do bloco "Dados para Admissão" logo abaixo (que não repete este campo). */}
                <Field label="Cargo / função do candidato" required>
                  <input value={dados.funcao} onChange={(e) => setDados((d) => ({ ...d, funcao: e.target.value }))}
                    placeholder="Ex: Auxiliar de produção" style={{ ...inputStyle, ...(missing(dados.funcao.trim() || null) ? inv : {}) }} />
                </Field>
                <p className="text-xs text-gray-500">
                  A Salmazos vai analisar a indicação e direcionar o candidato para uma vaga. Isto não cria vaga nem garante a contratação.
                  Preencha os dados abaixo conforme o tipo de serviço escolhido.
                </p>
              </div>
            )}

            {tipoServico && (
              <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  <span>📋</span> Dados para Admissão
                </p>
                <BlocoDadosAdmissao
                  tipoServico={tipoServico}
                  valores={dados}
                  onChange={(patch) => setDados((d) => ({ ...d, ...patch }))}
                  tentouEnviar={tentouEnviar}
                  ocultarFuncao={semVaga}
                  inputStyle={inputStyle}
                />
              </div>
            )}
          </>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
            {erro}
          </div>
        )}

        {(vaga || semVaga) && (
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
