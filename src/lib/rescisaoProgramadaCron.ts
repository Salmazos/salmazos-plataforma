import type { SupabaseClient } from "@supabase/supabase-js";

// Terceiro passo do cron diário rescisao-avisos (sem cron novo): vira 'desligado' o funcionário que ainda está
// 'ativo' e tem rescisão com data_desligamento <= hoje (Brasília). Devolve quantos foram efetivados.
// Lança em caso de erro de banco (quem chama isola em try/catch e loga).
export async function efetivarDesligamentosProgramados(svc: SupabaseClient, hojeISO: string): Promise<number> {
  // Só traz quem ainda está 'ativo' (inner join + filtro no embed) — a lista não cresce com o histórico de
  // rescisões já efetivadas.
  const { data: pendentes, error } = await svc
    .from("rescisoes")
    .select("funcionario_id, funcionarios!inner(status)")
    .lte("data_desligamento", hojeISO)
    .eq("funcionarios.status", "ativo");
  if (error) throw new Error(`buscar rescisões com data chegada: ${error.message}`);

  const ids = [...new Set((pendentes ?? []).map((r) => r.funcionario_id as string))];
  if (ids.length === 0) return 0;

  // .eq("status","ativo") de novo no UPDATE: idempotente e nunca sobrescreve quem mudou no meio do caminho.
  const { data: atualizados, error: updateError } = await svc
    .from("funcionarios")
    .update({ status: "desligado" })
    .in("id", ids)
    .eq("status", "ativo")
    .select("id");
  if (updateError) throw new Error(`atualizar status dos funcionários: ${updateError.message}`);
  return (atualizados ?? []).length;
}
