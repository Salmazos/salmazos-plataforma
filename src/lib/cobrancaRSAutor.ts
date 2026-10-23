import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Nome de quem gerou cada cobrança R&S (cobrancas_rs.gerado_por_user_id -> analistas_perfil),
// numa única consulta para a lista toda. Só o nome_completo é lido: e-mail e demais dados do
// analista não saem daqui. Quem não tem autor registrado (cobranças anteriores a 01/09/2026) ou
// perfil fica fora do mapa — a tela mostra "não registrado" em vez de inventar um nome.
export async function carregarNomesGeradoresCobrancaRS(
  svc: ServiceClient,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const distintos = Array.from(new Set(userIds.filter((id): id is string => !!id)));
  const nomes = new Map<string, string>();
  if (distintos.length === 0) return nomes;
  const { data } = await svc.from("analistas_perfil").select("user_id, nome_completo").in("user_id", distintos);
  for (const p of data ?? []) {
    if (p.nome_completo) nomes.set(p.user_id, p.nome_completo);
  }
  return nomes;
}
