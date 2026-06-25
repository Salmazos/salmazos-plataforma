"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { formatarCPF, formatarTelefone, validarCPF } from "@/lib/utils";
import { ESTADOS, HABILIDADES, TEMPO_EXPERIENCIA, TURNOS } from "@/lib/constants";
import BotaoVoltarSite from "@/components/BotaoVoltarSite";

interface FormData {
  nome_completo: string;
  cpf: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  idade: string;
  formacao_academica: string;
  cargo_pretendido: string;
  tempo_experiencia: string;
  turno_disponivel: string;
  pretensao_salarial: string;
  habilidades: string[];
  resumo_candidato: string;
}

const CARD: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "20px 24px",
  marginBottom: "16px",
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#FFD700",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "16px",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#374151",
  marginBottom: "4px",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#ffffff",
  color: "#374151",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

function formatarMoeda(value: string) {
  const nums = value.replace(/\D/g, "");
  if (!nums) return "";
  const n = parseInt(nums, 10) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function BancoTalentosPage() {
  const [form, setForm] = useState<FormData>({
    nome_completo: "",
    cpf: "",
    telefone: "",
    email: "",
    cidade: "",
    estado: "",
    idade: "",
    formacao_academica: "",
    cargo_pretendido: "",
    tempo_experiencia: "",
    turno_disponivel: "",
    pretensao_salarial: "",
    habilidades: [],
    resumo_candidato: "",
  });
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const [lgpdConsentimento, setLgpdConsentimento] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [hovering, setHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof FormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleHabilidade = (h: string) =>
    setForm((f) => ({
      ...f,
      habilidades: f.habilidades.includes(h)
        ? f.habilidades.filter((x) => x !== h)
        : [...f.habilidades, h],
    }));

  const validar = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.nome_completo.trim() || form.nome_completo.trim().length < 3)
      e.nome_completo = "Informe o nome completo (mín. 3 caracteres).";
    if (!validarCPF(form.cpf)) e.cpf = "CPF inválido.";
    if (form.telefone.replace(/\D/g, "").length < 10)
      e.telefone = "Telefone inválido.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "E-mail inválido.";
    if (!form.cidade.trim()) e.cidade = "Informe a cidade.";
    if (!form.estado) e.estado = "Selecione o estado.";
    if (!form.cargo_pretendido.trim()) e.cargo_pretendido = "Informe o cargo pretendido.";
    if (!form.tempo_experiencia) e.tempo_experiencia = "Selecione a experiência.";
    if (!form.turno_disponivel) e.turno_disponivel = "Selecione o turno.";
    if (curriculo && curriculo.size > 5 * 1024 * 1024)
      e.curriculo = "O arquivo deve ter no máximo 5 MB.";
    if (curriculo) {
      const ext = curriculo.name.split(".").pop()?.toLowerCase() ?? "";
      if (!["pdf", "doc", "docx", "jpg", "jpeg", "png"].includes(ext))
        e.curriculo = "Envie PDF, Word ou imagem (JPG, PNG).";
    }
    if (!lgpdConsentimento)
      e.lgpd = "É necessário aceitar a Política de Privacidade para continuar.";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    setErroGeral(null);

    try {
      let curriculo_url: string | null = null;
      if (curriculo) {
        const formData = new FormData();
        formData.append("arquivo", curriculo);
        const resUpload = await fetch("/api/upload-curriculo", {
          method: "POST",
          body: formData,
        });
        if (resUpload.ok) {
          const { url } = await resUpload.json();
          curriculo_url = url;
        }
      }

      const res = await fetch("/api/candidatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: form.nome_completo,
          cpf: form.cpf,
          telefone: form.telefone,
          email: form.email,
          cidade: form.cidade,
          estado: form.estado,
          idade: form.idade ? parseInt(form.idade) : null,
          formacao_academica: form.formacao_academica || null,
          cargo_pretendido: form.cargo_pretendido,
          tempo_experiencia: form.tempo_experiencia,
          turno_disponivel: form.turno_disponivel,
          pretensao_salarial: form.pretensao_salarial || null,
          habilidades: form.habilidades,
          resumo_candidato: form.resumo_candidato || null,
          curriculo_url,
          origem: "banco_talentos",
          lgpd_consentimento: lgpdConsentimento,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao enviar candidatura.");
      }

      setSucesso(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : "Ocorreu um erro inesperado.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000" }}>
      <BotaoVoltarSite />
      {/* Header */}
      <header style={{ backgroundColor: "#000", borderBottom: "3px solid #FFD700" }}>
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Salmazos_logo_Amarelo.png"
            alt="Salmazos RH"
            className="h-12 w-auto object-contain"
          />
          <Link
            href="/vagas"
            style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}
            className="hover:text-white transition-colors"
          >
            Ver vagas abertas →
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 pb-16">
        {/* Title card */}
        <div style={{ backgroundColor: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", padding: "24px", marginBottom: "24px", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", backgroundColor: "#FFD700", borderRadius: "12px", marginBottom: "12px" }}>
            <svg style={{ width: "24px", height: "24px", color: "#000" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
            Banco de Talentos
          </h1>
          <p style={{ fontSize: "14px", color: "#fff", lineHeight: 1.6 }}>
            Cadastre seu currículo e faça parte do nosso banco de talentos.<br />
            Quando surgir uma oportunidade compatível com seu perfil, entraremos em contato.
          </p>
        </div>

        {sucesso ? (
          <div style={{ backgroundColor: "#0d2818", border: "1px solid #16a34a", borderRadius: "16px", padding: "40px 32px", textAlign: "center" }}>
            <div style={{ width: "64px", height: "64px", backgroundColor: "#14532d", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg style={{ width: "32px", height: "32px", color: "#4ade80" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#4ade80", marginBottom: "8px" }}>
              Cadastro realizado com sucesso!
            </h3>
            <p style={{ fontSize: "14px", color: "#86efac" }}>
              Seu perfil foi adicionado ao nosso banco de talentos.<br />
              Entraremos em contato quando surgir uma oportunidade compatível.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>

            {/* Dados Pessoais */}
            <div style={CARD}>
              <p style={SECTION_TITLE}>Dados Pessoais</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label style={LABEL}>Nome completo <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" style={INPUT} placeholder="Seu nome completo"
                    value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)} />
                  {erros.nome_completo && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.nome_completo}</p>}
                </div>
                <div>
                  <label style={LABEL}>CPF <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" inputMode="numeric" style={INPUT} placeholder="000.000.000-00"
                    value={form.cpf} onChange={(e) => set("cpf", formatarCPF(e.target.value))} />
                  {erros.cpf && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.cpf}</p>}
                </div>
                <div>
                  <label style={LABEL}>Telefone / WhatsApp <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" inputMode="tel" style={INPUT} placeholder="(00) 00000-0000"
                    value={form.telefone} onChange={(e) => set("telefone", formatarTelefone(e.target.value))} />
                  {erros.telefone && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.telefone}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label style={LABEL}>E-mail <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="email" style={INPUT} placeholder="seuemail@exemplo.com"
                    value={form.email} onChange={(e) => set("email", e.target.value)} />
                  {erros.email && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.email}</p>}
                </div>
                <div>
                  <label style={LABEL}>Cidade <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" style={INPUT} placeholder="Sua cidade"
                    value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                  {erros.cidade && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.cidade}</p>}
                </div>
                <div>
                  <label style={LABEL}>Estado <span style={{ color: "#ef4444" }}>*</span></label>
                  <select style={INPUT} value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                    <option value="">Selecione</option>
                    {ESTADOS.map((s) => (
                      <option key={s.uf} value={s.uf}>{s.nome} ({s.uf})</option>
                    ))}
                  </select>
                  {erros.estado && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.estado}</p>}
                </div>
                <div>
                  <label style={LABEL}>Idade</label>
                  <input type="number" style={INPUT} placeholder="Ex: 28" min={14} max={99}
                    value={form.idade} onChange={(e) => set("idade", e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Formação acadêmica</label>
                  <input type="text" style={INPUT} placeholder="Ex: Ensino Médio Completo"
                    value={form.formacao_academica} onChange={(e) => set("formacao_academica", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Dados Profissionais */}
            <div style={CARD}>
              <p style={SECTION_TITLE}>Dados Profissionais</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label style={LABEL}>Cargo pretendido <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" style={INPUT} placeholder="Ex: Auxiliar Administrativo, Vendedor, Operador..."
                    value={form.cargo_pretendido} onChange={(e) => set("cargo_pretendido", e.target.value)} />
                  {erros.cargo_pretendido && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.cargo_pretendido}</p>}
                </div>
                <div>
                  <label style={LABEL}>Tempo de experiência <span style={{ color: "#ef4444" }}>*</span></label>
                  <select style={INPUT} value={form.tempo_experiencia} onChange={(e) => set("tempo_experiencia", e.target.value)}>
                    <option value="">Selecione</option>
                    {TEMPO_EXPERIENCIA.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {erros.tempo_experiencia && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.tempo_experiencia}</p>}
                </div>
                <div>
                  <label style={LABEL}>Turno disponível <span style={{ color: "#ef4444" }}>*</span></label>
                  <select style={INPUT} value={form.turno_disponivel} onChange={(e) => set("turno_disponivel", e.target.value)}>
                    <option value="">Selecione</option>
                    {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {erros.turno_disponivel && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.turno_disponivel}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label style={LABEL}>Pretensão salarial</label>
                  <input type="text" inputMode="numeric" style={INPUT} placeholder="R$ 0,00"
                    value={form.pretensao_salarial}
                    onChange={(e) => set("pretensao_salarial", formatarMoeda(e.target.value))} />
                </div>
              </div>
            </div>

            {/* Habilidades */}
            <div style={CARD}>
              <p style={SECTION_TITLE}>Habilidades</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {HABILIDADES.map((h) => {
                  const ativo = form.habilidades.includes(h);
                  return (
                    <label key={h} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: `1px solid ${ativo ? "#FFD700" : "#d1d5db"}`,
                      backgroundColor: ativo ? "rgba(255,215,0,0.12)" : "#f9fafb",
                      cursor: "pointer",
                      fontSize: "13px",
                      color: ativo ? "#92400e" : "#374151",
                      fontWeight: ativo ? 600 : 400,
                    }}>
                      <input type="checkbox" style={{ flexShrink: 0, accentColor: "#FFD700" }}
                        checked={ativo} onChange={() => toggleHabilidade(h)} />
                      <span>{h}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Resumo e Currículo */}
            <div style={CARD}>
              <p style={SECTION_TITLE}>Resumo e Currículo</p>
              <div style={{ marginBottom: "16px" }}>
                <label style={LABEL}>Resumo profissional</label>
                <textarea
                  style={{ ...INPUT, resize: "none", fontFamily: "inherit" }}
                  rows={5}
                  placeholder="Descreva brevemente sua trajetória, principais conquistas e objetivos profissionais..."
                  value={form.resumo_candidato}
                  onChange={(e) => set("resumo_candidato", e.target.value)}
                />
              </div>
              <div>
                <label style={LABEL}>Currículo</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onPointerEnter={() => setHovering(true)}
                  onPointerLeave={() => setHovering(false)}
                  style={{
                    cursor: "pointer",
                    border: `2px dashed ${curriculo ? "#FFD700" : hovering ? "#FFD700" : "#d1d5db"}`,
                    borderRadius: "10px",
                    padding: hovering && !curriculo ? "32px 24px" : "24px",
                    minHeight: hovering && !curriculo ? "120px" : "auto",
                    textAlign: "center",
                    backgroundColor: curriculo ? "rgba(255,215,0,0.05)" : hovering ? "rgba(255,215,0,0.03)" : "#f9fafb",
                    transition: "padding 0.2s ease, min-height 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
                  }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    style={{ display: "none", pointerEvents: "none" }}
                    onChange={(e) => setCurriculo(e.target.files?.[0] ?? null)}
                  />
                  {curriculo ? (
                    <div>
                      <svg style={{ width: "32px", height: "32px", margin: "0 auto 8px", color: "#FFD700" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p style={{ fontWeight: 500, fontSize: "14px", color: "#374151" }}>{curriculo.name}</p>
                      <p style={{ fontSize: "12px", marginTop: "4px", color: "#FFD700" }}>{(curriculo.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div>
                      <svg style={{ width: "32px", height: "32px", margin: "0 auto 8px", color: "#4b5563" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p style={{ fontSize: "14px", fontWeight: 500, color: "#9ca3af" }}>Clique para enviar seu currículo</p>
                      <p style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563" }}>PDF, Word ou imagem · máx. 5 MB</p>
                    </div>
                  )}
                </div>
                {erros.curriculo && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.curriculo}</p>}
              </div>
            </div>

            {/* LGPD Consent */}
            <div style={{ backgroundColor: "#111", border: `1px solid ${erros.lgpd ? "#ef4444" : "#333"}`, borderRadius: "12px", padding: "16px 20px", marginBottom: "12px" }}>
              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={lgpdConsentimento}
                  onChange={(e) => setLgpdConsentimento(e.target.checked)}
                  style={{ marginTop: "2px", flexShrink: 0, accentColor: "#FFD700", width: "16px", height: "16px", cursor: "pointer" }}
                />
                <span style={{ fontSize: "13px", color: "#d1d5db", lineHeight: 1.6 }}>
                  Li e aceito a{" "}
                  <a
                    href="/politica-de-privacidade"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#FFD700", textDecoration: "underline", fontWeight: 600 }}
                  >
                    Política de Privacidade
                  </a>
                  {" "}da Salmazos RH. Autorizo o uso dos meus dados pessoais para fins de recrutamento e seleção, conforme a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
                  <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>
                </span>
              </label>
            </div>
            {erros.lgpd && (
              <p style={{ color: "#ef4444", fontSize: "12px", marginBottom: "12px" }}>{erros.lgpd}</p>
            )}

            {erroGeral && (
              <div style={{ backgroundColor: "#2d1a1a", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", marginBottom: "16px" }}>
                {erroGeral}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              style={{
                width: "100%",
                padding: "14px",
                backgroundColor: enviando ? "#a38600" : "#FFD700",
                color: "#000",
                fontWeight: 700,
                fontSize: "16px",
                borderRadius: "12px",
                border: "none",
                cursor: enviando ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {enviando ? (
                <>
                  <svg style={{ animation: "spin 1s linear infinite", width: "16px", height: "16px" }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enviando...
                </>
              ) : "Enviar para o Banco de Talentos"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
