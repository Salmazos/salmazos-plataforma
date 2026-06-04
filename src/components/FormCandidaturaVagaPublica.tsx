"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatarCPF, formatarTelefone, validarCPF } from "@/lib/utils";
import { ESTADOS, HABILIDADES, TEMPO_EXPERIENCIA, TURNOS } from "@/lib/constants";

interface Props {
  vagaId: string;
  vagaTitulo: string;
}

interface FormData {
  nome_completo: string;
  cpf: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  tempo_experiencia: string;
  turno_disponivel: string;
  pretensao_salarial: string;
  habilidades: string[];
  resumo_candidato: string;
  formacao_academica: string;
  idade: string;
}

// Shared inline style tokens
const CARD: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
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
};

export default function FormCandidaturaVagaPublica({ vagaId, vagaTitulo }: Props) {
  const [form, setForm] = useState<FormData>({
    nome_completo: "",
    cpf: "",
    telefone: "",
    email: "",
    cidade: "",
    estado: "",
    tempo_experiencia: "",
    turno_disponivel: "",
    pretensao_salarial: "",
    habilidades: [],
    resumo_candidato: "",
    formacao_academica: "",
    idade: "",
  });
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [hovering, setHovering] = useState(false);

  const set = (field: keyof FormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const toggleHabilidade = (h: string) =>
    setForm((f) => ({
      ...f,
      habilidades: f.habilidades.includes(h)
        ? f.habilidades.filter((x) => x !== h)
        : [...f.habilidades, h],
    }));

  const formatarMoeda = (value: string) => {
    const nums = value.replace(/\D/g, "");
    if (!nums) return "";
    const n = parseInt(nums, 10) / 100;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

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
    if (!form.tempo_experiencia) e.tempo_experiencia = "Selecione a experiência.";
    if (!form.turno_disponivel) e.turno_disponivel = "Selecione o turno.";
    if (curriculo && curriculo.size > 5 * 1024 * 1024)
      e.curriculo = "O arquivo deve ter no máximo 5 MB.";
    if (curriculo) {
      const ext = curriculo.name.split(".").pop()?.toLowerCase() ?? "";
      if (!["pdf", "doc", "docx", "jpg", "jpeg", "png"].includes(ext))
        e.curriculo = "Envie PDF, Word ou imagem (JPG, PNG).";
    }
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    setErroGeral(null);

    try {
      let curriculo_url = "";
      if (curriculo) {
        const supabase = createClient();
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
        curriculo_url = supabase.storage.from("curriculos").getPublicUrl(fileName).data.publicUrl;
      }

      const res = await fetch("/api/candidatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cargo_pretendido: vagaTitulo,
          curriculo_url: curriculo_url || null,
          origem: "formulario_vaga",
          vaga_id: vagaId,
          formacao_academica: form.formacao_academica || null,
          idade: form.idade ? parseInt(form.idade) : null,
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

  if (sucesso) {
    return (
      <div style={{ backgroundColor: "#0d2818", border: "1px solid #16a34a", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
        <div style={{ width: "64px", height: "64px", backgroundColor: "#14532d", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg style={{ width: "32px", height: "32px", color: "#4ade80" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#4ade80", marginBottom: "8px" }}>Candidatura enviada com sucesso!</h3>
        <p style={{ fontSize: "14px", color: "#86efac" }}>Em breve entraremos em contato. Boa sorte!</p>
      </div>
    );
  }

  return (
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
              value={form.pretensao_salarial} onChange={(e) => set("pretensao_salarial", formatarMoeda(e.target.value))} />
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
                backgroundColor: ativo ? "rgba(255,215,0,0.1)" : "#f3f4f6",
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
          <textarea style={{ ...INPUT, resize: "none", fontFamily: "inherit" }} rows={5}
            placeholder="Descreva brevemente sua trajetória, principais conquistas e objetivos profissionais..."
            value={form.resumo_candidato} onChange={(e) => set("resumo_candidato", e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Currículo</label>
          <div
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
              position: "relative",
              border: `2px dashed ${curriculo || hovering ? "#FFD700" : "#d1d5db"}`,
              borderRadius: "10px",
              padding: hovering && !curriculo ? "32px 24px" : "24px",
              minHeight: hovering && !curriculo ? "120px" : "auto",
              textAlign: "center",
              backgroundColor: curriculo ? "rgba(255,215,0,0.05)" : hovering ? "rgba(255,215,0,0.03)" : "#f9fafb",
              transition: "padding 0.2s ease, min-height 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
            }}>
            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
              onChange={(e) => setCurriculo(e.target.files?.[0] ?? null)} />
            {curriculo ? (
              <div>
                <svg style={{ width: "32px", height: "32px", margin: "0 auto 8px", color: "#FFD700" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p style={{ fontWeight: 500, fontSize: "14px", color: "#fff" }}>{curriculo.name}</p>
                <p style={{ fontSize: "12px", marginTop: "4px", color: "#FFD700" }}>{(curriculo.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <svg style={{ width: "32px", height: "32px", margin: "0 auto 8px", color: "#4b5563" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "#9ca3af" }}>Clique ou arraste para enviar</p>
                <p style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563" }}>PDF, Word ou imagem · máx. 5 MB</p>
              </div>
            )}
          </div>
          {erros.curriculo && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{erros.curriculo}</p>}
        </div>
      </div>

      {erroGeral && (
        <div style={{ backgroundColor: "#2d1a1a", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", marginBottom: "16px" }}>
          {erroGeral}
        </div>
      )}

      <button type="submit" disabled={enviando}
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
        }}>
        {enviando ? (
          <>
            <svg style={{ animation: "spin 1s linear infinite", width: "16px", height: "16px" }} fill="none" viewBox="0 0 24 24">
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Enviando...
          </>
        ) : "Enviar Candidatura"}
      </button>
    </form>
  );
}
