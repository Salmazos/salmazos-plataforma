"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarData } from "@/lib/utils";
import { ETAPAS_KANBAN } from "@/lib/constants";
import PerfilEtapaSelector from "@/components/PerfilEtapaSelector";
import PerfilAnotacoes from "@/components/PerfilAnotacoes";
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
  };
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

  const set =
    (field: keyof ReturnType<typeof makeForm>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleCancelar = () => {
    setForm(makeForm(candidato));
    setErro("");
    setEditando(false);
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
                <InfoItem label="Pretensão salarial" value={candidato.pretensao_salarial || "Não informado"} />
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

          {/* Resumo profissional */}
          {!editando ? (
            candidato.resumo_profissional ? (
              <div className="card">
                <p className="section-title">Resumo Profissional</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {candidato.resumo_profissional}
                </p>
              </div>
            ) : null
          ) : (
            <div className="card">
              <p className="section-title">Resumo Profissional</p>
              <textarea
                value={form.resumo_profissional}
                onChange={set("resumo_profissional")}
                rows={4}
                placeholder="Resumo profissional do candidato..."
                className="input-field resize-none w-full"
              />
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
    </>
  );
}
