import SemAcessoPainel from "@/components/SemAcessoPainel";
import { notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import CandidatoPerfilTabs from "@/components/CandidatoPerfilTabs";
import BotaoVoltarPainel from "@/components/BotaoVoltarPainel";
import { resolverUnidadeUsuario } from "@/lib/unidadeAuth";
import type { Candidato } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidatoPerfilPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";

  const { data } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();

  const candidato = data as Candidato;

  // Candidato é compartilhado entre unidades, mas os dados de candidatura (vaga, garantia,
  // fee, retenção, etapa real) mostrados no perfil são só os de vagas da unidade de quem
  // está vendo.
  const ctx = user ? await resolverUnidadeUsuario(user) : null;
  if (!ctx) return <SemAcessoPainel />;

  // Fetch candidatos_vagas with guarantee OR fee data — inclui também os campos de admissão
  // preenchidos pelo cliente na aprovação (api/portal/avaliar), que até agora só existiam
  // no e-mail de notificação e não apareciam em nenhuma tela do painel.
  let cvQuery = supabase
    .from("candidatos_vagas")
    .select(
      "id, vaga_id, etapa, garantia_data_fim, garantia_acionada, garantia_acionada_em, " +
      "admissao_fee_percentual, admissao_fee_valor, admissao_fee_prazo, fee_status, " +
      "admissao_data_inicio, admissao_salario, admissao_salario_hora, admissao_cargo, " +
      "admissao_setor, admissao_centro_custo, admissao_horario, admissao_gestor, " +
      "admissao_periodo_experiencia, admissao_funcao, admissao_turno, admissao_escala, " +
      "admissao_tempo_contrato, admissao_vt, admissao_exame_responsavel, " +
      "admissao_local_integracao, admissao_telefone_candidato, admissao_observacoes, " +
      "vagas!candidatos_vagas_vaga_id_fkey!inner(titulo, tipo_servico)"
    )
    .eq("candidato_id", id)
    .order("created_at", { ascending: false });
  if (!ctx.todasUnidades) cvQuery = cvQuery.eq("vagas.unidade_id", ctx.unidadeId);
  const { data: cvRows } = await cvQuery;

  // Etapa real do Kanban pra exibir no perfil (só leitura — ver PerfilEtapaSelector).
  // candidato.etapa_kanban é um espelho que fica desatualizado quando a movimentação
  // acontece pela tela de Vaga (candidatos-vagas/[id]/route.ts não grava lá) — a fonte
  // de verdade de "em que fase o candidato está no Kanban" é candidatos_vagas.etapa,
  // não o campo em candidatos. Como um candidato pode ter mais de uma candidatura,
  // usa a mais recente (cvRows já vem ordenado por created_at desc).
  const etapaKanbanReal = cvRows?.[0]?.etapa ?? candidato.etapa_kanban ?? "triagem";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const garantiaRow = (cvRows ?? []).find((r: any) => r.garantia_data_fim != null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? (cvRows ?? []).find((r: any) => r.admissao_fee_percentual != null)
    ?? null;

  // Linha com dados de admissão preenchidos pelo cliente — critério mais amplo que o do
  // garantiaRow acima (que exige garantia OU fee, coisas que só existem em vaga de R&S com
  // fee configurado): aqui qualquer campo admissao_* preenchido conta, porque MOT e
  // Terceirização também passam por essa aprovação e não têm fee/garantia.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admissaoRow = (cvRows ?? []).find((r: any) =>
    r.admissao_data_inicio != null || r.admissao_setor != null || r.admissao_horario != null ||
    r.admissao_gestor != null || r.admissao_funcao != null || r.admissao_turno != null ||
    r.admissao_escala != null || r.admissao_tempo_contrato != null || r.admissao_salario != null ||
    r.admissao_salario_hora != null
  ) ?? null;

  // Best retention score from candidatos_vagas
  let retencaoQuery = supabase
    .from("candidatos_vagas")
    .select("retencao_score, retencao_label, retencao_resumo, vagas!candidatos_vagas_vaga_id_fkey!inner(unidade_id)")
    .eq("candidato_id", id)
    .not("retencao_score", "is", null);
  if (!ctx.todasUnidades) retencaoQuery = retencaoQuery.eq("vagas.unidade_id", ctx.unidadeId);
  const { data: retencaoRow } = await retencaoQuery
    .order("retencao_score", { ascending: false })
    .limit(1)
    .maybeSingle();

  const melhorRetencao = retencaoRow
    ? {
        score: retencaoRow.retencao_score as number,
        label: retencaoRow.retencao_label as string,
        resumo: (retencaoRow.retencao_resumo ?? null) as string | null,
      }
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const garantiaInfo = garantiaRow ? (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = garantiaRow as any;
    return {
      cv_id: r.id as string,
      vaga_id: r.vaga_id as string,
      etapa: r.etapa as string,
      garantia_data_fim: (r.garantia_data_fim ?? "") as string,
      garantia_acionada: (r.garantia_acionada ?? false) as boolean,
      garantia_acionada_em: (r.garantia_acionada_em ?? null) as string | null,
      vaga_titulo: (r.vagas?.titulo ?? null) as string | null,
      admissao_fee_percentual: (r.admissao_fee_percentual ?? null) as number | null,
      admissao_fee_valor: (r.admissao_fee_valor ?? null) as number | null,
      admissao_fee_prazo: (r.admissao_fee_prazo ?? null) as string | null,
      fee_status: (r.fee_status ?? null) as string | null,
    };
  })() : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admissaoInfo = admissaoRow ? (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = admissaoRow as any;
    return {
      cv_id: r.id as string,
      vaga_titulo: (r.vagas?.titulo ?? null) as string | null,
      tipo_servico: (r.vagas?.tipo_servico ?? null) as string | null,
      data_inicio: (r.admissao_data_inicio ?? null) as string | null,
      salario: (r.admissao_salario ?? null) as number | null,
      salario_hora: (r.admissao_salario_hora ?? null) as number | null,
      cargo: (r.admissao_cargo ?? null) as string | null,
      setor: (r.admissao_setor ?? null) as string | null,
      centro_custo: (r.admissao_centro_custo ?? null) as string | null,
      horario: (r.admissao_horario ?? null) as string | null,
      gestor: (r.admissao_gestor ?? null) as string | null,
      periodo_experiencia: (r.admissao_periodo_experiencia ?? null) as string | null,
      funcao: (r.admissao_funcao ?? null) as string | null,
      turno: (r.admissao_turno ?? null) as string | null,
      escala: (r.admissao_escala ?? null) as string | null,
      tempo_contrato: (r.admissao_tempo_contrato ?? null) as string | null,
      vt: (r.admissao_vt ?? null) as boolean | null,
      exame_responsavel: (r.admissao_exame_responsavel ?? null) as string | null,
      local_integracao: (r.admissao_local_integracao ?? null) as string | null,
      telefone_candidato: (r.admissao_telefone_candidato ?? null) as string | null,
      observacoes: (r.admissao_observacoes ?? null) as string | null,
    };
  })() : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <BotaoVoltarPainel />
      </div>

      <CandidatoPerfilTabs
        candidato={candidato}
        garantiaInfo={garantiaInfo}
        admissaoInfo={admissaoInfo}
        melhorRetencao={melhorRetencao}
        role={role}
        etapaKanbanReal={etapaKanbanReal}
      />
    </div>
  );
}
