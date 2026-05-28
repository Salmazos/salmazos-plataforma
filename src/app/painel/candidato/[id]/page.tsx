import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { formatarData } from "@/lib/utils";
import { ETAPAS_KANBAN } from "@/lib/constants";
import PerfilEtapaSelector from "@/components/PerfilEtapaSelector";
import PerfilAnotacoes from "@/components/PerfilAnotacoes";
import type { Candidato } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidatoPerfilPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();

  const candidato = data as Candidato;
  const etapa = ETAPAS_KANBAN.find((e) => e.id === candidato.etapa_kanban);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/painel" className="hover:text-[#FFB800] transition-colors">
          ← Voltar ao painel
        </Link>
      </div>

      {/* Header do candidato */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center text-[#FFB800] text-xl font-bold shrink-0">
              {candidato.nome_completo.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {candidato.nome_completo}
              </h1>
              <p className="text-[#FFB800] font-medium text-sm">
                {candidato.cargo_pretendido}
              </p>
              <p className="text-gray-400 text-xs mt-0.5">
                Cadastrado em {formatarData(candidato.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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

            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${etapa?.badgeBg} ${etapa?.badgeText}`}>
              {etapa?.label}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal — dados */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dados pessoais */}
          <div className="card">
            <p className="section-title">Dados Pessoais</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <InfoItem label="CPF" value={candidato.cpf} />
              <InfoItem label="Telefone" value={candidato.telefone} />
              <InfoItem label="E-mail" value={candidato.email} />
              <InfoItem label="Localização" value={`${candidato.cidade} – ${candidato.estado}`} />
            </dl>
          </div>

          {/* Dados profissionais */}
          <div className="card">
            <p className="section-title">Dados Profissionais</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <InfoItem label="Cargo pretendido" value={candidato.cargo_pretendido} />
              <InfoItem label="Experiência" value={candidato.tempo_experiencia} />
              <InfoItem label="Turno disponível" value={candidato.turno_disponivel} />
              <InfoItem
                label="Pretensão salarial"
                value={candidato.pretensao_salarial || "Não informado"}
              />
            </dl>
          </div>

          {/* Habilidades */}
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

          {/* Resumo */}
          {candidato.resumo_profissional && (
            <div className="card">
              <p className="section-title">Resumo Profissional</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {candidato.resumo_profissional}
              </p>
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
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="font-medium text-gray-800 mt-0.5">{value}</dd>
    </div>
  );
}
