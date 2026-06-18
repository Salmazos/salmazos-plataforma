"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/utils";
import { ETAPAS_KANBAN } from "@/lib/constants";
import { TEMPLATE_OPTIONS } from "@/lib/emailTemplates";
import type { EmailTemplateName } from "@/lib/emailTemplates";
import PerfilEtapaSelector from "@/components/PerfilEtapaSelector";
import PerfilAnotacoes from "@/components/PerfilAnotacoes";
import TriagemBadge from "@/components/TriagemBadge";
import type { Candidato } from "@/types";

interface Props {
  candidato: Candidato;
}

const TURNOS = ["Integral", "Manhã", "Tarde", "Noite", "Flexível"];

function makeForm(c: Candidato) {
  return {
    nome_completo: c.nome_completo,
    telefone: c.telefone,
    email: c.email || "",
    cpf: c.cpf || "",
    cidade: c.cidade || "",
    estado: c.estado || "",
    cargo_pretendido: c.cargo_pretendido,
    tempo_experiencia: c.tempo_experiencia,
    turno_disponivel: c.turno_disponivel,
    pretensao_salarial: c.pretensao_salarial || "",
    idade: c.idade ? String(c.idade) : "",
    formacao_academica: c.formacao_academica || "",
    resumo_profissional: c.resumo_profissional || "",
    resumo_candidato: c.resumo_candidato || "",
    experiencias_profissionais: c.experiencias_profissionais || "",
  };
}

function formatarSalario(valor: string | number | null | undefined): string {
  if (!valor) return "Não informado";
  const num = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : valor;
  if (isNaN(num)) return "Não informado";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="font-medium text-gray-800 mt-0.5">{value}</dd>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function PerfilEdicao({ candidato }: Props) {
  const router = useRouter();
  const etapa = ETAPAS_KANBAN.find((e) => e.id === candidato.etapa_kanban);

  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(() => makeForm(candidato));

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplateName>("entrevista_salmazos");
  const [emailEnviando, setEmailEnviando] = useState(false);
  const [emailMensagem, setEmailMensagem] = useState<{ ok: boolean; texto: string } | null>(null);

  const [waDropdownOpen, setWaDropdownOpen] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  const WA_OPCOES = [
    {
      label: "Convocar para Entrevista",
      msg: `Olá ${candidato.nome_completo}! Somos da Salmazos RH. Temos uma oportunidade de emprego que combina com seu perfil para a vaga de ${candidato.cargo_pretendido}. Gostaríamos de convidá-lo(a) para uma entrevista. Poderia nos informar sua disponibilidade? 😊`,
    },
    {
      label: "Comunicar Aprovação",
      msg: `Olá ${candidato.nome_completo}! Temos uma ótima notícia! Você foi aprovado(a) no processo seletivo para a vaga de ${candidato.cargo_pretendido}. Entre em contato conosco para os próximos passos. Parabéns! 🎉`,
    },
    {
      label: "Comunicar Reprovação",
      msg: `Olá ${candidato.nome_completo}! Agradecemos sua participação no processo seletivo da Salmazos RH. No momento, seguimos com outro perfil, mas manteremos seu currículo em nosso banco de talentos para futuras oportunidades. Obrigado! 😊`,
    },
    {
      label: "Solicitar Documentos",
      msg: `Olá ${candidato.nome_completo}! Para darmos continuidade ao seu processo de contratação, precisamos dos seguintes documentos: RG, CPF, Carteira de Trabalho, Comprovante de Residência e foto 3x4. Pode nos enviar assim que possível? 😊`,
    },
  ];

  const set =
    (field: keyof ReturnType<typeof makeForm>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleCancelar = () => {
    setForm(makeForm(candidato));
    setErro("");
    setEditando(false);
  };

  const handleRecalcularTriagem = async () => {
    setRecalculando(true);
    try {
      await fetch(`/api/candidatos/${candidato.id}/triagem`, { method: "POST" });
      router.refresh();
    } finally {
      setRecalculando(false);
    }
  };

  const handleEnviarEmail = async () => {
    setEmailEnviando(true);
    setEmailMensagem(null);
    try {
      const res = await fetch(`/api/candidatos/${candidato.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: emailTemplate }),
      });
      if (!res.ok) {
        const json = await res.json();
        setEmailMensagem({ ok: false, texto: json.error || "Erro ao enviar e-mail." });
      } else {
        setEmailMensagem({ ok: true, texto: "E-mail enviado com sucesso!" });
        setTimeout(() => setEmailModalOpen(false), 1500);
      }
    } catch {
      setEmailMensagem({ ok: false, texto: "Erro ao enviar e-mail. Tente novamente." });
    } finally {
      setEmailEnviando(false);
    }
  };

  const handleSalvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/candidatos/${candidato.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          idade: form.idade ? parseInt(form.idade) : null,
          pretensao_salarial: form.pretensao_salarial || null,
          formacao_academica: form.formacao_academica || null,
          resumo_profissional: form.resumo_profissional || null,
          experiencias_profissionais: form.experiencias_profissionais || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setErro(json.error || "Erro ao salvar.");
        return;
      }
      const json = await res.json();
      setForm(makeForm(json.data as Candidato));
      setEditando(false);
      router.refresh();
    } catch {
      setErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      {/* Header do candidato */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center text-[#FFB800] text-xl font-bold shrink-0">
              {(editando ? form.nome_completo : candidato.nome_completo).charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {editando ? form.nome_completo : candidato.nome_completo}
              </h1>
              <p className="text-[#FFB800] font-medium text-sm">
                {editando ? form.cargo_pretendido : candidato.cargo_pretendido}
              </p>
              {!editando && candidato.triagem_score != null && candidato.triagem_label && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <TriagemBadge
                    score={candidato.triagem_score}
                    label={candidato.triagem_label}
                    resumo={candidato.triagem_resumo ?? undefined}
                    size="md"
                  />
                  {candidato.triagem_resumo && (
                    <span className="text-xs text-gray-400">{candidato.triagem_resumo}</span>
                  )}
                </div>
              )}
              <p className="text-gray-400 text-xs mt-0.5">
                Cadastrado em {formatarData(candidato.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {candidato.curriculo_url && (
              <a
                href={candidato.curriculo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Baixar currículo
              </a>
            )}

            {!editando && (
              <button
                onClick={handleRecalcularTriagem}
                disabled={recalculando}
                className="btn-outline flex items-center gap-1.5"
              >
                🔄 {recalculando ? "Calculando..." : "Recalcular Triagem"}
              </button>
            )}

            {!editando && candidato.email && (
              <button
                onClick={() => { setEmailMensagem(null); setEmailModalOpen(true); }}
                className="btn-outline flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                ✉️ Enviar Email
              </button>
            )}

            {!editando && candidato.telefone && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setWaDropdownOpen((o) => !o)}
                  style={{
                    backgroundColor: "#25D366",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "7px 14px",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  📱 WhatsApp
                </button>
                {waDropdownOpen && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 10 }}
                      onClick={() => setWaDropdownOpen(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 6px)",
                        background: "#fff",
                        borderRadius: "10px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        minWidth: "240px",
                        zIndex: 20,
                        overflow: "hidden",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      {WA_OPCOES.map(({ label, msg }, i) => (
                        <button
                          key={label}
                          onClick={() => {
                            window.open(
                              `https://wa.me/55${candidato.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`,
                              "_blank"
                            );
                            setWaDropdownOpen(false);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "11px 16px",
                            background: "none",
                            border: "none",
                            borderBottom: i < WA_OPCOES.length - 1 ? "1px solid #f3f4f6" : "none",
                            fontSize: "13px",
                            color: "#111827",
                            cursor: "pointer",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {!editando ? (
              <button onClick={() => setEditando(true)} className="btn-outline">
                Editar
              </button>
            ) : (
              <>
                <button onClick={handleCancelar} className="btn-outline" disabled={salvando}>
                  Cancelar
                </button>
                <button onClick={handleSalvar} className="btn-primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </>
            )}

            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${etapa?.badgeBg} ${etapa?.badgeText}`}>
              {etapa?.label}
            </span>
          </div>
        </div>

        {erro && (
          <p className="mt-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}
      </div>

      {/* Info panel — Score / Processos / Melhor Match */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Score */}
        <div className="card" style={{ textAlign: "center", padding: "16px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Score
          </div>
          {candidato.triagem_score != null && candidato.triagem_label ? (
            <TriagemBadge score={candidato.triagem_score} label={candidato.triagem_label} resumo={candidato.triagem_resumo ?? undefined} size="md" />
          ) : (
            <span style={{ color: "#9CA3AF", fontSize: 13, fontStyle: "italic" }}>Aguardando</span>
          )}
        </div>

        {/* Processos */}
        <div className="card" style={{ textAlign: "center", padding: "16px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Processos
          </div>
          {candidato.juridico_consultado_em == null ? (
            <span style={{ color: "#9CA3AF", fontSize: 13, fontStyle: "italic" }}>Consultando...</span>
          ) : candidato.juridico_tem_trabalhista ? (
            <span style={{ display: "inline-block", background: "#FEE2E2", color: "#991B1B", padding: "3px 10px", borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
              {"⚠"} Trabalhista ({candidato.juridico_total_processos ?? 0})
            </span>
          ) : (
            <span style={{ display: "inline-block", background: "#D1FAE5", color: "#065F46", padding: "3px 10px", borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
              {"✓"} Limpo
            </span>
          )}
        </div>

        {/* Melhor Match */}
        <div className="card" style={{ textAlign: "center", padding: "16px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
            Melhor Match
          </div>
          {candidato.melhor_match_score != null ? (
            <div>
              <span style={{
                display: "inline-block",
                background: candidato.melhor_match_score >= 70 ? "#D1FAE5" : candidato.melhor_match_score >= 40 ? "#FEF3C7" : "#FEE2E2",
                color: candidato.melhor_match_score >= 70 ? "#065F46" : candidato.melhor_match_score >= 40 ? "#92400E" : "#991B1B",
                padding: "3px 10px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
              }}>
                {candidato.melhor_match_score}%
              </span>
              {candidato.melhor_match_vaga_titulo && (
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{candidato.melhor_match_vaga_titulo}</div>
              )}
            </div>
          ) : (
            <span style={{ color: "#9CA3AF", fontSize: 13, fontStyle: "italic" }}>Calculando...</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal — dados */}
        <div className="lg:col-span-2 space-y-6">

          {/* Dados pessoais */}
          <div className="card">
            <p className="section-title">Dados Pessoais</p>
            {!editando ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InfoItem label="CPF" value={candidato.cpf?.startsWith("TEMP-") ? "Não informado" : candidato.cpf} />
                <InfoItem label="Telefone" value={candidato.telefone} />
                <InfoItem label="E-mail" value={candidato.email} />
                <InfoItem label="Localização" value={`${candidato.cidade} – ${candidato.estado}`} />
                {candidato.idade && <InfoItem label="Idade" value={`${candidato.idade} anos`} />}
              </dl>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo label="Nome completo">
                  <input type="text" value={form.nome_completo} onChange={set("nome_completo")} className="input-field" />
                </Campo>
                <Campo label="CPF">
                  <input type="text" value={form.cpf} onChange={set("cpf")} className="input-field" />
                </Campo>
                <Campo label="Telefone">
                  <input type="text" value={form.telefone} onChange={set("telefone")} className="input-field" />
                </Campo>
                <Campo label="E-mail">
                  <input type="text" value={form.email} onChange={set("email")} className="input-field" />
                </Campo>
                <Campo label="Cidade">
                  <input type="text" value={form.cidade} onChange={set("cidade")} className="input-field" />
                </Campo>
                <Campo label="Estado (sigla)">
                  <input type="text" value={form.estado} onChange={set("estado")} className="input-field" maxLength={2} />
                </Campo>
                <Campo label="Idade">
                  <input type="number" value={form.idade} onChange={set("idade")} className="input-field" min={14} max={99} />
                </Campo>
              </div>
            )}
          </div>

          {/* Dados profissionais */}
          <div className="card">
            <p className="section-title">Dados Profissionais</p>
            {!editando ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InfoItem label="Cargo pretendido" value={candidato.cargo_pretendido} />
                <InfoItem label="Experiência" value={candidato.tempo_experiencia} />
                <InfoItem label="Turno disponível" value={candidato.turno_disponivel} />
                <InfoItem label="Pretensão salarial" value={formatarSalario(candidato.pretensao_salarial)} />
                {candidato.formacao_academica && <InfoItem label="Formação" value={candidato.formacao_academica} />}
              </dl>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo label="Cargo pretendido">
                  <input type="text" value={form.cargo_pretendido} onChange={set("cargo_pretendido")} className="input-field" />
                </Campo>
                <Campo label="Experiência">
                  <input type="text" value={form.tempo_experiencia} onChange={set("tempo_experiencia")} className="input-field" />
                </Campo>
                <Campo label="Turno disponível">
                  <select value={form.turno_disponivel} onChange={set("turno_disponivel")} className="input-field">
                    {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
                <Campo label="Pretensão salarial">
                  <input type="text" value={form.pretensao_salarial} onChange={set("pretensao_salarial")} className="input-field" />
                </Campo>
                <Campo label="Formação acadêmica">
                  <input type="text" value={form.formacao_academica} onChange={set("formacao_academica")} className="input-field" />
                </Campo>
              </div>
            )}
          </div>

          {/* Habilidades — sempre read-only */}
          {candidato.habilidades?.length > 0 && (
            <div className="card">
              <p className="section-title">Habilidades</p>
              <div className="flex flex-wrap gap-2">
                {candidato.habilidades.map((h) => (
                  <span
                    key={h}
                    className="bg-[#FFB800]/10 text-black text-xs font-medium px-3 py-1 rounded-full border border-[#FFB800]/40"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resumo do candidato (escrito pelo próprio) */}
          {!editando ? (
            candidato.resumo_candidato ? (
              <div className="card">
                <p className="section-title">Resumo do Candidato</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {candidato.resumo_candidato}
                </p>
              </div>
            ) : null
          ) : (
            <div className="card">
              <p className="section-title">Resumo do Candidato</p>
              <textarea
                value={form.resumo_profissional}
                onChange={set("resumo_profissional")}
                rows={4}
                placeholder="Resumo escrito pelo candidato..."
                className="input-field resize-none w-full"
              />
            </div>
          )}

          {/* Análise do currículo pela IA */}
          {candidato.resumo_profissional && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="section-title !mb-0">Análise do Currículo pela IA</p>
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "#f3f0ff", color: "#6b46c1" }}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Gerado por IA
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {candidato.resumo_profissional}
              </p>
            </div>
          )}

          {/* Experiências profissionais */}
          {!editando ? (
            candidato.experiencias_profissionais ? (
              <div className="card">
                <p className="section-title">Experiências Profissionais</p>
                <div>
                  {/* Split only on | followed by { to avoid breaking JSON with | inside strings */}
                  {candidato.experiencias_profissionais.split(/\|\s*(?=\{)/).map((exp, i) => {
                    const txt = exp.trim();
                    if (!txt) return null;
                    try {
                      const p = JSON.parse(txt);
                      if (p?.empresa) {
                        return (
                          <div
                            key={i}
                            style={{
                              borderLeft: "3px solid #FFD700",
                              padding: "12px 16px",
                              marginBottom: "12px",
                              background: "#fff",
                              borderRadius: "8px",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 600, color: "#1f2937", fontSize: "14px" }}>
                                {p.empresa}
                              </span>
                              {p.periodo && (
                                <span style={{ fontSize: "11px", color: "#6b7280", flexShrink: 0 }}>
                                  {p.periodo}
                                </span>
                              )}
                            </div>
                            {p.cargo && (
                              <div style={{ color: "#FFD700", fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>
                                {p.cargo}
                              </div>
                            )}
                            {p.setor && (
                              <div style={{ color: "#9ca3af", fontSize: "11px", marginTop: "2px" }}>
                                {p.setor}
                              </div>
                            )}
                            {p.descricao && (
                              <div style={{ color: "#374151", fontSize: "13px", marginTop: "6px", lineHeight: 1.6 }}>
                                {p.descricao}
                              </div>
                            )}
                          </div>
                        );
                      }
                    } catch { /* fall through to plain text */ }
                    return (
                      <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#FFD700", marginTop: "6px", flexShrink: 0 }} />
                        <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.6 }}>{txt}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null
          ) : (
            <div className="card">
              <p className="section-title">Experiências Profissionais</p>
              <textarea
                value={form.experiencias_profissionais}
                onChange={set("experiencias_profissionais")}
                rows={6}
                placeholder="Ex: Empresa X — Auxiliar Administrativo — ... | Empresa Y — Atendente — ..."
                className="input-field resize-none w-full"
              />
              <p className="text-xs text-gray-400 mt-1">Separe cada experiência com &quot;|&quot;</p>
            </div>
          )}
        </div>

        {/* Coluna lateral — pipeline e anotações */}
        <div className="space-y-6">
          <div className="card">
            <p className="section-title">Etapa no Pipeline</p>
            <PerfilEtapaSelector
              candidatoId={candidato.id}
              etapaAtual={candidato.etapa_kanban}
            />
          </div>

          <div className="card">
            <p className="section-title">Anotações Internas</p>
            <PerfilAnotacoes
              candidatoId={candidato.id}
              anotacoesIniciais={candidato.anotacoes}
            />
          </div>
        </div>
      </div>

      {/* Modal de envio de e-mail */}
      {emailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEmailModalOpen(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">✉️ Enviar E-mail</h2>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-1">Destinatário</p>
            <p className="text-sm font-medium text-gray-800 mb-4">{candidato.email}</p>

            <label className="block text-sm text-gray-500 mb-1">Template</label>
            <select
              value={emailTemplate}
              onChange={(e) => setEmailTemplate(e.target.value as EmailTemplateName)}
              className="input-field w-full mb-4"
            >
              {TEMPLATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <div
              className="rounded-lg p-4 mb-5 text-sm text-gray-700 leading-relaxed"
              style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
            >
              <p className="font-semibold text-amber-800 mb-1 text-xs uppercase tracking-wide">Pré-visualização</p>
              <p>
                {TEMPLATE_OPTIONS.find((o) => o.value === emailTemplate)?.label} para{" "}
                <strong>{candidato.nome_completo}</strong> ({candidato.cargo_pretendido})
              </p>
            </div>

            {emailMensagem && (
              <p
                className={`text-sm rounded-lg px-3 py-2 mb-4 ${
                  emailMensagem.ok
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                {emailMensagem.texto}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEmailModalOpen(false)}
                className="btn-outline"
                disabled={emailEnviando}
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarEmail}
                disabled={emailEnviando}
                style={{
                  backgroundColor: "#000",
                  color: "#FFD700",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 20px",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: emailEnviando ? "not-allowed" : "pointer",
                  opacity: emailEnviando ? 0.7 : 1,
                }}
              >
                {emailEnviando ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
