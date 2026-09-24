import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Recalcula total/primeira/última visita e último visitante de uma empresa da Carteira de
// Clientes a partir das visitas REAIS (km_visitas + data do km_registros). Antes isso era um
// contador +1 a cada POST de visita com "última visita = agora" — mas a tela de KM, ao editar
// um registro, apaga todas as visitas dele e grava de novo, então cada edição somava visitas
// fantasmas e trocava a data da última visita pela data da edição (conferido em 24/09: 26 de
// 39 contadores errados, 203 contados × 119 reais; 37 de 39 com "última visita" errada).
//
// As visitas casam com a empresa pelo NOME (km_visitas não guarda o id da empresa) e só contam
// as de analistas da mesma unidade da empresa — a carteira é separada por unidade.
export async function recalcularEmpresaVisitada(svc: ServiceClient, nome: string, unidadeId: string): Promise<void> {
  const { data: visitas, error: visitasErr } = await svc
    .from("km_visitas")
    .select("registro_id")
    .ilike("empresa", nome);
  if (visitasErr) throw new Error(visitasErr.message);

  const registroIds = [...new Set((visitas ?? []).map((v) => v.registro_id as string))];
  const { data: registros } = registroIds.length
    ? await svc.from("km_registros").select("id, data, analista_id").in("id", registroIds)
    : { data: [] as { id: string; data: string; analista_id: string }[] };

  const analistaIds = [...new Set((registros ?? []).map((r) => r.analista_id).filter(Boolean))];
  const { data: perfis } = analistaIds.length
    ? await svc.from("analistas_perfil").select("id, nome_completo, user_id, unidade_id").in("id", analistaIds)
    : { data: [] as { id: string; nome_completo: string; user_id: string; unidade_id: string }[] };

  const perfilPorId = new Map((perfis ?? []).map((p) => [p.id, p]));
  const registroPorId = new Map((registros ?? []).map((r) => [r.id, r]));

  const visitasDaUnidade = (visitas ?? [])
    .map((v) => registroPorId.get(v.registro_id as string))
    .filter((r): r is { id: string; data: string; analista_id: string } => !!r && perfilPorId.get(r.analista_id)?.unidade_id === unidadeId)
    .sort((a, b) => a.data.localeCompare(b.data));

  // Sem visita nenhuma a empresa continua na carteira (é base permanente de prospecção), só
  // com o total zerado — as datas antigas ficam como estavam.
  const campos: Record<string, unknown> = { total_visitas: visitasDaUnidade.length };
  if (visitasDaUnidade.length > 0) {
    const primeira = visitasDaUnidade[0];
    const ultima = visitasDaUnidade[visitasDaUnidade.length - 1];
    const ultimoVisitante = perfilPorId.get(ultima.analista_id);
    // km_registros.data é só dia; meio-dia de Brasília pra não virar o dia anterior na tela.
    campos.primeira_visita_em = `${primeira.data}T12:00:00-03:00`;
    campos.ultima_visita_em = `${ultima.data}T12:00:00-03:00`;
    campos.ultimo_visitante_id = ultimoVisitante?.user_id ?? null;
    campos.ultimo_visitante_nome = ultimoVisitante?.nome_completo ?? null;
  }

  const { error } = await svc.from("empresas_visitadas").update(campos).ilike("nome", nome).eq("unidade_id", unidadeId);
  if (error) throw new Error(error.message);
}
