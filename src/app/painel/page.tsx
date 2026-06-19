import { createServiceClient } from "@/lib/supabase/server";
import PainelLayout from "@/components/PainelLayout";
import type { KanbanCard } from "@/types";

export const dynamic = "force-dynamic";

const ETAPAS_KANBAN_VISIVEIS = ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"];

export default async function PainelPage() {
  const supabase = createServiceClient();

  const { data: cvData, error: cvError } = await supabase
    .from("candidatos_vagas")
    .select(`
      id, etapa, vaga_id, observacoes, created_at,
      candidatos!inner(id, nome_completo, cargo_pretendido, cidade, estado, triagem_score, triagem_label, origem, bloqueado, responsavel, created_at, updated_at),
      vagas!inner(id, titulo, tipo_servico)
    `)
    .in("etapa", ETAPAS_KANBAN_VISIVEIS)
    .order("created_at", { ascending: false });

  if (cvError) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        Erro ao carregar candidatos: {cvError.message}
      </div>
    );
  }

  const cards: KanbanCard[] = ((cvData ?? []) as unknown as {
    id: string;
    etapa: string;
    vaga_id: string;
    observacoes: string | null;
    created_at: string;
    candidatos: {
      id: string;
      nome_completo: string;
      cargo_pretendido: string;
      cidade: string;
      estado: string;
      triagem_score: number | null;
      triagem_label: string | null;
      origem: string | null;
      bloqueado: boolean | null;
      responsavel: string | null;
      created_at: string;
      updated_at: string;
    };
    vagas: { id: string; titulo: string; tipo_servico: string | null };
  }[]).map((cv) => ({
    cv_id: cv.id,
    etapa: cv.etapa,
    vaga_id: cv.vaga_id,
    vaga_titulo: cv.vagas.titulo,
    vaga_tipo_servico: cv.vagas.tipo_servico,
    observacoes: cv.observacoes,
    candidato_id: cv.candidatos.id,
    nome_completo: cv.candidatos.nome_completo,
    cargo_pretendido: cv.candidatos.cargo_pretendido,
    cidade: cv.candidatos.cidade,
    estado: cv.candidatos.estado,
    triagem_score: cv.candidatos.triagem_score,
    triagem_label: cv.candidatos.triagem_label,
    origem: cv.candidatos.origem,
    bloqueado: cv.candidatos.bloqueado,
    responsavel: cv.candidatos.responsavel,
    created_at: cv.created_at,
    candidato_created_at: cv.candidatos.created_at,
  }));

  // ── Métricas ──────────────────────────────────────────────────
  const totalAtivos = cards.length;

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const aprovadosNoMes = cards.filter(
    (c) => c.etapa === "aprovado_cliente" && new Date(c.created_at) >= inicioMes
  ).length;

  const origensMap = new Map<string, number>();
  cards.forEach((c) => {
    const key = c.origem ?? "Banco de talentos";
    origensMap.set(key, (origensMap.get(key) ?? 0) + 1);
  });
  const vagas = Array.from(origensMap.entries())
    .map(([cargo, count]) => ({ cargo, count }))
    .sort((a, b) => b.count - a.count);

  const recentes = cards.slice(0, 5).map((c) => ({
    id: c.candidato_id,
    nome_completo: c.nome_completo,
    cargo_pretendido: c.cargo_pretendido,
    created_at: c.candidato_created_at,
  }));

  return (
    <PainelLayout
      cards={cards}
      totalAtivos={totalAtivos}
      aprovadosNoMes={aprovadosNoMes}
      tempoMedioDias={0}
      vagas={vagas}
      recentes={recentes}
    />
  );
}
