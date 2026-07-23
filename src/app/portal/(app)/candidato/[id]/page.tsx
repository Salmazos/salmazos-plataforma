import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import PortalAvaliacaoBtn from "@/components/PortalAvaliacaoBtn";
import MatchScoreBadge from "@/components/MatchScoreBadge";
import { BotaoCurriculo } from "@/components/BotaoCurriculo";
import type { MatchDetalhes } from "@/types";

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

  const supabase = await createPortalClient();
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
      `id, status, data_entrevista, feedback_cliente, avaliado_em, vaga_id,
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

  // Fetch best match score for this candidate across this client's vagas
  const { data: vagasCliente } = await service
    .from("vagas")
    .select("id")
    .eq("cliente_id", clienteUsuario.cliente_id);

  const vagaIds = (vagasCliente ?? []).map((v: any) => v.id); // eslint-disable-line @typescript-eslint/no-explicit-any
  let matchScore: number | null = null;
  let matchDetalhes: MatchDetalhes | null = null;

  if (vagaIds.length > 0 && c?.id) {
    const { data: matchRow } = await service
      .from("candidatos_vagas")
      .select("match_score, match_detalhes")
      .eq("candidato_id", c.id)
      .in("vaga_id", vagaIds)
      .not("match_score", "is", null)
      .order("match_score", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (matchRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      matchScore = (matchRow as any).match_score ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      matchDetalhes = (matchRow as any).match_detalhes ?? null;
    }
  }

  // Fetch vaga details for admission form
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encVagaId = (enc as any).vaga_id as string | null;
  let vagaTipoServico: string | null = null;
  let vagaFeePercentual: number | null = null;
  let vagaFeePrazo: string | null = null;
  let vagaIdFinal: string | null = null;
  let cvId: string | null = null;

  if (encVagaId) {
    const { data: vagaRow } = await service
      .from("vagas")
      .select("id, titulo, tipo_servico, fee_rs_percentual, fee_rs_prazo_cobranca")
      .eq("id", encVagaId)
      .single();

    if (vagaRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = vagaRow as any;
      vagaTipoServico = v.tipo_servico ?? null;
      vagaFeePercentual = v.fee_rs_percentual ?? null;
      vagaFeePrazo = v.fee_rs_prazo_cobranca ?? null;
      vagaIdFinal = v.id;
    }

    if (c?.id) {
      const { data: cvRow } = await service
        .from("candidatos_vagas")
        .select("id")
        .eq("candidato_id", c.id)
        .eq("vaga_id", encVagaId)
        .limit(1)
        .maybeSingle();
      cvId = cvRow?.id ?? null;
    }
  }

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
            {matchScore != null && (
              <div className="mt-2">
                <MatchScoreBadge score={matchScore} size="md" />
              </div>
            )}
          </div>
          {c.curriculo_url && (
            <BotaoCurriculo storagePath={c.curriculo_url} variant="button" label="Ver currículo" />
          )}
        </div>
      </div>

      {/* Aderência à Vaga */}
      {matchScore != null && matchDetalhes && (
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title !mb-0">Aderência à Vaga</p>
            <MatchScoreBadge score={matchScore} size="md" />
          </div>
          {matchDetalhes.resumo && (
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">{matchDetalhes.resumo}</p>
          )}
          <div className="space-y-3">
            {[
              { label: "Cargo",        value: matchDetalhes.cargo_match },
              { label: "Habilidades",  value: matchDetalhes.habilidades_match },
              { label: "Localização",  value: matchDetalhes.localizacao_match },
              { label: "Experiência",  value: matchDetalhes.experiencia_match },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-24 shrink-0">{label}</span>
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "#f3f4f6" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${value}%`,
                      backgroundColor:
                        value >= 80 ? "#22c55e" :
                        value >= 60 ? "#FFD700" :
                        value >= 40 ? "#f97316" : "#9ca3af",
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700 w-10 text-right">{value}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <div className="space-y-4">
            {(c.experiencias_profissionais as string).split("|").map((exp: string, i: number) => {
              const txt = exp.trim();
              if (!txt) return null;
              try {
                const p = JSON.parse(txt);
                if (p && typeof p === "object" && (p.empresa || p.cargo || p.setor || p.descricao)) {
                  return (
                    <div key={i} style={{ borderLeft: "2px solid #FFD700", paddingLeft: "12px" }} className="space-y-0.5">
                      {(p.empresa || p.periodo) && (
                        <div className="flex flex-wrap items-start justify-between gap-1">
                          {p.empresa && (
                            <p className="font-semibold text-gray-800 text-sm">{p.empresa}</p>
                          )}
                          {p.periodo && (
                            <span className="text-[10px] text-gray-400 shrink-0">{p.periodo}</span>
                          )}
                        </div>
                      )}
                      {p.cargo && (
                        <p className="text-xs font-medium" style={{ color: "#E6A800" }}>{p.cargo}</p>
                      )}
                      {p.setor && (
                        <p className="text-[10px] text-gray-400">{p.setor}</p>
                      )}
                      {p.descricao && (
                        <p className="text-sm text-gray-600 mt-1 leading-relaxed">{p.descricao}</p>
                      )}
                    </div>
                  );
                }
              } catch { /* fallback below */ }
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
        tipoServico={vagaTipoServico}
        feePercentual={vagaFeePercentual}
        feePrazo={vagaFeePrazo}
        vagaId={vagaIdFinal}
        cvId={cvId}
      />
    </div>
  );
}
