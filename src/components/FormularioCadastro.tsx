"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatarCPF, formatarTelefone, validarCPF } from "@/lib/utils";
import { ESTADOS, HABILIDADES, TEMPO_EXPERIENCIA, TURNOS } from "@/lib/constants";

interface FormData {
  nome_completo: string;
  cpf: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  cargo_pretendido: string;
  tempo_experiencia: string;
  turno_disponivel: string;
  pretensao_salarial: string;
  habilidades: string[];
  resumo_candidato: string;
  formacao_academica: string;
  idade: string;
  experiencias_profissionais: string;
  lgpd_consentimento: boolean;
}

interface Props {
  vagaParam?: string;
}

export default function FormularioCadastro({ vagaParam }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    nome_completo: "",
    cpf: "",
    telefone: "",
    email: "",
    cidade: "",
    estado: "",
    cargo_pretendido: vagaParam ?? "",
    tempo_experiencia: "",
    turno_disponivel: "",
    pretensao_salarial: "",
    habilidades: [],
    resumo_candidato: "",
    formacao_academica: "",
    idade: "",
    experiencias_profissionais: "",
    lgpd_consentimento: false,
  });
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
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

  const formatarMoeda = (value: string) => {
    const nums = value.replace(/\D/g, "");
    if (!nums) return "";
    const number = parseInt(nums, 10) / 100;
    return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    if (!form.cargo_pretendido.trim())
      e.cargo_pretendido = "Informe o cargo pretendido.";
    if (!form.tempo_experiencia) e.tempo_experiencia = "Selecione a experiência.";
    if (!form.turno_disponivel) e.turno_disponivel = "Selecione o turno.";
    if (curriculo && curriculo.size > 5 * 1024 * 1024)
      e.curriculo = "O arquivo deve ter no máximo 5 MB.";
    if (curriculo) {
      const ext = curriculo.name.split(".").pop()?.toLowerCase() ?? "";
      const allowed = ["pdf", "doc", "docx", "jpg", "jpeg", "png"];
      if (!allowed.includes(ext))
        e.curriculo = "Envie PDF, Word ou imagem (JPG, PNG).";
    }
    if (!form.lgpd_consentimento)
      e.lgpd_consentimento = "Você precisa aceitar a Política de Privacidade para continuar.";
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
          ext === "doc" || ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
          "application/pdf";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("curriculos")
          .upload(fileName, curriculo, { contentType });
        if (uploadErr) throw new Error("Falha ao enviar o currículo. Tente novamente.");
        curriculo_url = fileName;
      }

      const origem = vagaParam ? "vaga_especifica" : "banco_talentos";

      const res = await fetch("/api/candidatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          curriculo_url,
          origem,
          formacao_academica: form.formacao_academica || null,
          idade: form.idade ? parseInt(form.idade) : null,
          experiencias_profissionais: form.experiencias_profissionais || null,
          lgpd_consentimento: true,
          lgpd_data_consentimento: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao enviar candidatura.");
      }

      router.push("/obrigado");
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : "Ocorreu um erro inesperado.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#000" }}>
      {/* Cabeçalho */}
      <header className="bg-black shadow-lg">
        <div className="flex justify-center py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Salmazos_logo_Amarelo.png"
            alt="Salmazos RH & Serviços"
            className="h-[80px] w-auto object-contain"
          />
        </div>
      </header>

      {/* Banner de vaga específica */}
      {vagaParam ? (
        <div className="bg-black border-b-2 border-[#FFD700]/30">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <span className="shrink-0 bg-[#FFD700] text-black p-1.5 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
            <p className="text-sm text-[#FFD700]/70">
              Você está se candidatando para:{" "}
              <strong className="text-[#FFD700] text-base font-bold">{vagaParam}</strong>
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-black border-b border-gray-800">
          <div className="max-w-3xl mx-auto px-4 py-3 text-center">
            <p className="text-[#FFD700]/80 text-sm font-medium tracking-wide">
              Cadastre-se no nosso banco de talentos
            </p>
          </div>
        </div>
      )}

      {/* Formulário */}
      <main className="max-w-3xl mx-auto px-4 py-8 pb-16">
        <div className="mb-6">
          <h2 className="text-2xl font-bold" style={{ color: "#fff" }}>
            {vagaParam ? "Formulário de Candidatura" : "Banco de Talentos"}
          </h2>
          <p className="text-sm mt-1" style={{ color: "#9ca3af" }}>
            {vagaParam
              ? `Preencha os campos abaixo para concluir sua candidatura à vaga de ${vagaParam}.`
              : "Preencha os campos abaixo para entrar em nosso banco de talentos e ser encontrado por oportunidades."}
            {" "}Os campos marcados com <span className="text-red-500">*</span> são obrigatórios.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* ── Dados Pessoais ── */}
          <div className="card">
            <p className="section-title">Dados Pessoais</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Nome completo <span className="text-red-500">*</span></label>
                <input type="text" className="input-field" placeholder="Seu nome completo"
                  value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)} />
                {erros.nome_completo && <p className="text-red-500 text-xs mt-1">{erros.nome_completo}</p>}
              </div>

              <div>
                <label className="label">CPF <span className="text-red-500">*</span></label>
                <input type="text" inputMode="numeric" className="input-field" placeholder="000.000.000-00"
                  value={form.cpf} onChange={(e) => set("cpf", formatarCPF(e.target.value))} />
                {erros.cpf && <p className="text-red-500 text-xs mt-1">{erros.cpf}</p>}
              </div>

              <div>
                <label className="label">Telefone / WhatsApp <span className="text-red-500">*</span></label>
                <input type="text" inputMode="tel" className="input-field" placeholder="(00) 00000-0000"
                  value={form.telefone} onChange={(e) => set("telefone", formatarTelefone(e.target.value))} />
                {erros.telefone && <p className="text-red-500 text-xs mt-1">{erros.telefone}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="label">E-mail <span className="text-red-500">*</span></label>
                <input type="email" className="input-field" placeholder="seuemail@exemplo.com"
                  value={form.email} onChange={(e) => set("email", e.target.value)} />
                {erros.email && <p className="text-red-500 text-xs mt-1">{erros.email}</p>}
              </div>

              <div>
                <label className="label">Cidade <span className="text-red-500">*</span></label>
                <input type="text" className="input-field" placeholder="Sua cidade"
                  value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                {erros.cidade && <p className="text-red-500 text-xs mt-1">{erros.cidade}</p>}
              </div>

              <div>
                <label className="label">Estado <span className="text-red-500">*</span></label>
                <select className="input-field" value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                  <option value="">Selecione</option>
                  {ESTADOS.map((s) => (
                    <option key={s.uf} value={s.uf}>{s.nome} ({s.uf})</option>
                  ))}
                </select>
                {erros.estado && <p className="text-red-500 text-xs mt-1">{erros.estado}</p>}
              </div>
            </div>
          </div>

          {/* ── Dados Profissionais ── */}
          <div className="card">
            <p className="section-title">Dados Profissionais</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Cargo pretendido <span className="text-red-500">*</span></label>
                {vagaParam ? (
                  <div className="relative">
                    <input type="text" className="input-field bg-gray-50 cursor-not-allowed pr-10"
                      value={form.cargo_pretendido} readOnly disabled />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <svg className="w-4 h-4 text-[#FFD700]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <p className="text-xs text-gray-400 mt-1">Campo preenchido automaticamente pela vaga selecionada.</p>
                  </div>
                ) : (
                  <>
                    <input type="text" className="input-field" placeholder="Ex.: Assistente Administrativo"
                      value={form.cargo_pretendido} onChange={(e) => set("cargo_pretendido", e.target.value)} />
                    {erros.cargo_pretendido && <p className="text-red-500 text-xs mt-1">{erros.cargo_pretendido}</p>}
                  </>
                )}
              </div>

              <div>
                <label className="label">Tempo de experiência <span className="text-red-500">*</span></label>
                <select className="input-field" value={form.tempo_experiencia}
                  onChange={(e) => set("tempo_experiencia", e.target.value)}>
                  <option value="">Selecione</option>
                  {TEMPO_EXPERIENCIA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {erros.tempo_experiencia && <p className="text-red-500 text-xs mt-1">{erros.tempo_experiencia}</p>}
              </div>

              <div>
                <label className="label">Turno disponível <span className="text-red-500">*</span></label>
                <select className="input-field" value={form.turno_disponivel}
                  onChange={(e) => set("turno_disponivel", e.target.value)}>
                  <option value="">Selecione</option>
                  {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {erros.turno_disponivel && <p className="text-red-500 text-xs mt-1">{erros.turno_disponivel}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="label">Pretensão salarial</label>
                <input type="text" inputMode="numeric" className="input-field" placeholder="R$ 0,00"
                  value={form.pretensao_salarial}
                  onChange={(e) => set("pretensao_salarial", formatarMoeda(e.target.value))} />
              </div>
            </div>
          </div>

          {/* ── Habilidades ── */}
          <div className="card">
            <p className="section-title">Habilidades</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {HABILIDADES.map((h) => (
                <label key={h}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm
                    ${form.habilidades.includes(h)
                      ? "border-[#FFB800] bg-[#FFB800]/10 text-black font-medium"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"}`}
                >
                  <input type="checkbox" className="shrink-0"
                    checked={form.habilidades.includes(h)} onChange={() => toggleHabilidade(h)} />
                  <span>{h}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Resumo e Currículo ── */}
          <div className="card">
            <p className="section-title">Resumo e Currículo</p>
            <div className="mb-4">
              <label className="label">Resumo profissional</label>
              <textarea className="input-field resize-none" rows={5}
                placeholder="Descreva brevemente sua trajetória, principais conquistas e objetivos profissionais..."
                value={form.resumo_candidato} onChange={(e) => set("resumo_candidato", e.target.value)} />
            </div>

            <div>
              <label className="label">Currículo (PDF)</label>
              <div
                className="relative text-center"
                onPointerEnter={() => { console.log('hover ON'); setHovering(true); }}
                onPointerLeave={() => setHovering(false)}
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: "pointer",
                  border: `2px dashed ${curriculo ? "#FFB800" : hovering ? "#FFD700" : "#d1d5db"}`,
                  borderRadius: "8px",
                  padding: hovering && !curriculo ? "32px 24px" : "24px",
                  minHeight: hovering && !curriculo ? "120px" : "auto",
                  backgroundColor: curriculo ? "rgba(255,184,0,0.1)" : hovering ? "rgba(255,215,0,0.03)" : "#f9fafb",
                  transition: "padding 0.2s ease, min-height 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
                }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  style={{ display: "none", pointerEvents: "none" }}
                  onChange={(e) => setCurriculo(e.target.files?.[0] ?? null)} />
                {curriculo ? (
                  <div className="text-black">
                    <svg className="w-8 h-8 mx-auto mb-2 text-[#FFB800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium text-sm">{curriculo.name}</p>
                    <p className="text-xs mt-1 text-[#FFB800]">{(curriculo.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">Clique ou arraste para enviar</p>
                    <p className="text-xs mt-1">Somente PDF · máx. 5 MB</p>
                  </div>
                )}
              </div>
              {erros.curriculo && <p className="text-red-500 text-xs mt-1">{erros.curriculo}</p>}
            </div>
          </div>

          {/* ── Consentimento LGPD ── */}
          <div className="card">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0 w-4 h-4 accent-[#FFB800]"
                checked={form.lgpd_consentimento}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lgpd_consentimento: e.target.checked }))
                }
              />
              <span className="text-sm text-gray-300 leading-relaxed">
                Li e aceito a{" "}
                <span className="text-[#FFD700] underline">Política de Privacidade</span>{" "}
                e consinto com o tratamento dos meus dados pessoais para fins de recrutamento e
                seleção, conforme a Lei Geral de Proteção de Dados (LGPD – Lei 13.709/2018).{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
            {erros.lgpd_consentimento && (
              <p className="text-red-500 text-xs mt-2 ml-7">{erros.lgpd_consentimento}</p>
            )}
          </div>

          {/* ── Submit ── */}
          {erroGeral && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {erroGeral}
            </div>
          )}

          <button type="submit" disabled={enviando}
            className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2">
            {enviando ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enviando...
              </>
            ) : (
              "Enviar Candidatura"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
