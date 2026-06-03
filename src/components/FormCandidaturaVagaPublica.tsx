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
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-green-800 mb-2">Candidatura enviada com sucesso!</h3>
        <p className="text-green-700 text-sm">Em breve entraremos em contato. Boa sorte!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Dados Pessoais */}
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
          <div>
            <label className="label">Idade</label>
            <input type="number" className="input-field" placeholder="Ex: 28" min={14} max={99}
              value={form.idade} onChange={(e) => set("idade", e.target.value)} />
          </div>
          <div>
            <label className="label">Formação acadêmica</label>
            <input type="text" className="input-field" placeholder="Ex: Ensino Médio Completo"
              value={form.formacao_academica} onChange={(e) => set("formacao_academica", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Dados Profissionais */}
      <div className="card">
        <p className="section-title">Dados Profissionais</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Habilidades */}
      <div className="card">
        <p className="section-title">Habilidades</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {HABILIDADES.map((h) => (
            <label key={h}
              className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm
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

      {/* Resumo e Currículo */}
      <div className="card">
        <p className="section-title">Resumo e Currículo</p>
        <div className="mb-4">
          <label className="label">Resumo profissional</label>
          <textarea className="input-field resize-none" rows={5}
            placeholder="Descreva brevemente sua trajetória, principais conquistas e objetivos profissionais..."
            value={form.resumo_candidato} onChange={(e) => set("resumo_candidato", e.target.value)} />
        </div>
        <div>
          <label className="label">Currículo</label>
          <div className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${curriculo ? "border-[#FFB800] bg-[#FFB800]/10" : "border-gray-300 hover:border-[#FFB800]"}`}>
            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              onChange={(e) => setCurriculo(e.target.files?.[0] ?? null)} />
            {curriculo ? (
              <div>
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
                <p className="text-xs mt-1">PDF, Word ou imagem · máx. 5 MB</p>
              </div>
            )}
          </div>
          {erros.curriculo && <p className="text-red-500 text-xs mt-1">{erros.curriculo}</p>}
        </div>
      </div>

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
        ) : "Enviar Candidatura"}
      </button>
    </form>
  );
}
