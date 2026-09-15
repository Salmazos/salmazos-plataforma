import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface DestinatarioFaturamentoHortolandia {
  user_id: string;
  nome_completo: string;
}

// Aviso de atraso do Faturamento Hortolândia é só pra diretoria (mesmo grupo que já
// enxerga o módulo — ver faturamentoHortolandiaAuth.ts) — sem lógica de responsável
// individual como em obterDestinatariosCobrancaRS/obterDestinatariosSupervisaoAtraso,
// porque contas_receber_hortolandia não tem um "dono" por lançamento.
export async function obterDestinatariosFaturamentoHortolandiaAtraso(
  supabase?: ServiceClient
): Promise<DestinatarioFaturamentoHortolandia[]> {
  const svc = supabase ?? createServiceClient();

  const { data: analistas } = await svc
    .from("analistas_perfil")
    .select("user_id, nome_completo, nivel_acesso")
    .eq("ativo", true)
    .in("nivel_acesso", ["diretoria", "superuser"]);

  return (analistas ?? [])
    .filter((a): a is { user_id: string; nome_completo: string; nivel_acesso: string } => !!a.user_id)
    .map((a) => ({ user_id: a.user_id, nome_completo: a.nome_completo }));
}
