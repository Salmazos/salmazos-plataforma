import type { SupabaseClient } from "@supabase/supabase-js";

interface EncaminhamentoRow {
  candidato_id: string;
  vaga_id: string | null;
  tipo_servico: string | null;
  created_at: string;
}

// Modalidade "vigente" de uma candidatura (candidato_id + vaga_id): o tipo_servico do
// encaminhamento mais recente tem prioridade sobre vagas.tipo_servico, porque reflete o
// que foi de fato combinado com o cliente na entrevista — que pode divergir do
// tipo_servico fixado na vaga. Quem chama decide o fallback (normalmente
// vagas.tipo_servico) quando a candidatura não tem nenhum encaminhamento.
export async function mapTipoServicoPorCandidatura(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  candidatoIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (candidatoIds.length === 0) return map;

  const { data } = await supabase
    .from("encaminhamentos")
    .select("candidato_id, vaga_id, tipo_servico, created_at")
    .in("candidato_id", candidatoIds)
    .order("created_at", { ascending: false });

  ((data ?? []) as EncaminhamentoRow[]).forEach((enc) => {
    if (!enc.vaga_id) return;
    const key = `${enc.candidato_id}|${enc.vaga_id}`;
    // Já ordenado por created_at desc — a primeira ocorrência de cada chave é a mais recente.
    if (!map.has(key)) map.set(key, enc.tipo_servico);
  });

  return map;
}

interface EncaminhamentoAgendamentoRow {
  candidato_id: string;
  vaga_id: string | null;
  status: string;
  data_entrevista: string | null;
  created_at: string;
}

// Status + data de entrevista do encaminhamento vigente de uma candidatura — usado
// pro card do Kanban distinguir "data já definida" de "aguardando o cliente marcar"
// na etapa Entrevista Cliente. Mesmo critério de "mais recente vence" do helper acima.
export async function mapEncaminhamentoAgendamentoPorCandidatura(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  candidatoIds: string[]
): Promise<Map<string, { status: string; data_entrevista: string | null }>> {
  const map = new Map<string, { status: string; data_entrevista: string | null }>();
  if (candidatoIds.length === 0) return map;

  const { data } = await supabase
    .from("encaminhamentos")
    .select("candidato_id, vaga_id, status, data_entrevista, created_at")
    .in("candidato_id", candidatoIds)
    .order("created_at", { ascending: false });

  ((data ?? []) as EncaminhamentoAgendamentoRow[]).forEach((enc) => {
    if (!enc.vaga_id) return;
    const key = `${enc.candidato_id}|${enc.vaga_id}`;
    if (!map.has(key)) map.set(key, { status: enc.status, data_entrevista: enc.data_entrevista });
  });

  return map;
}
