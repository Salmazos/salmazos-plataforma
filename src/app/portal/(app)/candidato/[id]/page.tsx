import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import PortalAvaliacaoBtn from "@/components/PortalAvaliacaoBtn";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="font-medium text-gray-800 mt-0.5">{value}</dd>
    </div>
  );
}

export default async function PortalCandidatoPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();

  if (!clienteUsuario) redirect("/portal/login");

  // id = encaminhamento_id; verify it belongs to this client
  const { data: enc } = await service
    .from("encaminhamentos")
    .select(
      `id, status, data_entrevista, feedback_cliente, avaliado_em,
       candidatos(
         id, nome_completo, cargo_pretendido, cidade, estado,
         habilidades, resumo_profissional, resumo_candidato,
         experiencias_profissionais, tempo_experiencia, turno_disponivel,
         pretensao_salarial, idade, formacao_academica, curriculo_url
       )`
    )
    .eq("id", id)
    .eq("cliente_id", clienteUsuario.cliente_id)
    .single();

  if (!enc) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = enc.candidatos as any;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/portal" className="hover:text-[#FFB800] transition-colors">
          ← Voltar à lista
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-start gap-4 flex-wrap">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
            style={{ backgroundColor: "#000", color: "#FFD700" }}
          >
            {c.nome_completo?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{c.nome_completo}</h1>
            <p className="text-sm font-medium mt-0.5" style={{ color: "#E6A800" }}>
              {c.cargo_pretendido}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {c.cidade} – {c.estado}
            </p>
          </div>
          {c.curriculo_url && (
            <a
              href={c.curriculo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Currículo
            </a>
          )}
        </div>
      </div>

      {/* Dados profissionais */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
        <p className="section-title">Dados Profissionais</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <InfoItem label="Cargo pretendido" value={c.cargo_pretendido} />
          <InfoItem label="Experiência" value={c.tempo_experiencia} />
          <InfoItem label="Turno disponível" value={c.turno_disponivel} />
          {c.pretensao_salarial && (
            <InfoItem label="Pretensão salarial" value={c.pretensao_salarial} />
          )}
          {c.formacao_academica && (
            <InfoItem label="Formação" value={c.formacao_academica} />
          )}
          {c.idade && <InfoItem label="Idade" value={`${c.idade} anos`} />}
        </dl>
      </div>

      {/* Habilidades */}
      {c.habilidades?.length > 0 && (
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <p className="section-title">Habilidades</p>
          <div className="flex flex-wrap gap-2">
            {(c.habilidades as string[]).map((h) => (
              <span
                key={h}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{
                  backgroundColor: "rgba(255,215,0,0.15)",
                  color: "#000",
                  border: "1px solid rgba(255,215,0,0.4)",
                }}
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resumo do candidato */}
      {c.resumo_candidato && (
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <p className="section-title">Sobre o Candidato</p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {c.resumo_candidato}
          </p>
        </div>
      )}

      {/* Análise IA */}
      {c.resumo_profissional && (
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title !mb-0">Análise do Currículo</p>
            <span
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#f3f0ff", color: "#6b46c1" }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              Gerado por IA
            </span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {c.resumo_profissional}
          </p>
        </div>
      )}

      {/* Experiências profissionais */}
      {c.experiencias_profissionais && (
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <p className="section-title">Experiências Profissionais</p>
          <div className="space-y-3">
            {(c.experiencias_profissionais as string).split("|").map((exp, i) => {
              const txt = exp.trim();
              if (!txt) return null;
              return (
                <div key={i} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FFD700] mt-1.5 shrink-0" />
                  <p className="text-sm text-gray-700 leading-relaxed">{txt}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Approve / Reject */}
      <PortalAvaliacaoBtn
        encaminhamentoId={enc.id}
        statusAtual={enc.status}
        feedbackAtual={(enc as any).feedback_cliente ?? ""}
      />
    </div>
  );
}
