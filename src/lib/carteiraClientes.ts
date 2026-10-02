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
//
// Além das visitas da KM, contam como "contato" com a empresa as interações do funil comercial
// (exceto mudança de fase) e os registros de contato da própria carteira. Esses dois casam por id.
type Evento = { quando: string; analistaId: string | null };

export async function recalcularEmpresaVisitada(
  svc: ServiceClient,
  nome: string,
  unidadeId: string,
  empresaVisitadaId?: string
): Promise<void> {
  const { data: visitas, error: visitasErr } = await svc
    .from("km_visitas")
    .select("registro_id")
    .ilike("empresa", nome);
  if (visitasErr) throw new Error(visitasErr.message);

  const registroIds = [...new Set((visitas ?? []).map((v) => v.registro_id as string))];
  const { data: registros } = registroIds.length
    ? await svc.from("km_registros").select("id, data, analista_id").in("id", registroIds)
    : { data: [] as { id: string; data: string; analista_id: string }[] };

  const kmAnalistaIds = [...new Set((registros ?? []).map((r) => r.analista_id).filter(Boolean))];
  const { data: perfisKm } = kmAnalistaIds.length
    ? await svc.from("analistas_perfil").select("id, nome_completo, user_id, unidade_id").in("id", kmAnalistaIds)
    : { data: [] as { id: string; nome_completo: string; user_id: string; unidade_id: string }[] };
  const perfilKmPorId = new Map((perfisKm ?? []).map((p) => [p.id, p]));
  const registroPorId = new Map((registros ?? []).map((r) => [r.id, r]));

  // km_registros.data é só dia; meio-dia de Brasília pra não virar o dia anterior na tela.
  const eventos: Evento[] = (visitas ?? [])
    .map((v) => registroPorId.get(v.registro_id as string))
    .filter((r): r is { id: string; data: string; analista_id: string } => !!r && perfilKmPorId.get(r.analista_id)?.unidade_id === unidadeId)
    .map((r) => ({ quando: `${r.data}T12:00:00-03:00`, analistaId: r.analista_id }));

  // Empresa da carteira (por id; sem id, localiza por nome + unidade).
  let empresaId = empresaVisitadaId ?? null;
  if (!empresaId) {
    const { data: emp } = await svc.from("empresas_visitadas").select("id").ilike("nome", nome).eq("unidade_id", unidadeId).limit(1).maybeSingle();
    empresaId = emp?.id ?? null;
  }

  if (empresaId) {
    const { data: ops } = await svc.from("oportunidades").select("id").eq("empresa_visitada_id", empresaId).eq("unidade_id", unidadeId);
    const opIds = (ops ?? []).map((o) => o.id as string);
    if (opIds.length) {
      const { data: interacoes, error: intErr } = await svc
        .from("oportunidade_interacoes")
        .select("created_at, autor_id")
        .in("oportunidade_id", opIds)
        .neq("tipo", "mudanca_etapa");
      if (intErr) throw new Error(intErr.message);
      for (const i of interacoes ?? []) eventos.push({ quando: i.created_at as string, analistaId: (i.autor_id as string) ?? null });
    }
    const { data: contatos, error: contErr } = await svc
      .from("contatos_registros")
      .select("ocorrido_em, autor_id")
      .eq("empresa_visitada_id", empresaId)
      .eq("unidade_id", unidadeId);
    if (contErr) throw new Error(contErr.message);
    for (const c of contatos ?? []) {
      const dia = String(c.ocorrido_em).slice(0, 10);
      eventos.push({ quando: `${dia}T12:00:00-03:00`, analistaId: (c.autor_id as string) ?? null });
    }
  }

  eventos.sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime());

  // Sem evento nenhum a empresa continua na carteira (é base permanente de prospecção), só
  // com o total zerado — as datas antigas ficam como estavam.
  const campos: Record<string, unknown> = { total_visitas: eventos.length };
  if (eventos.length > 0) {
    const primeiro = eventos[0];
    const ultimo = eventos[eventos.length - 1];
    let ultimoPerfil = ultimo.analistaId ? perfilKmPorId.get(ultimo.analistaId) : undefined;
    if (!ultimoPerfil && ultimo.analistaId) {
      const { data: p } = await svc.from("analistas_perfil").select("id, nome_completo, user_id, unidade_id").eq("id", ultimo.analistaId).maybeSingle();
      ultimoPerfil = p ?? undefined;
    }
    campos.primeira_visita_em = primeiro.quando;
    campos.ultima_visita_em = ultimo.quando;
    campos.ultimo_visitante_id = ultimoPerfil?.user_id ?? null;
    campos.ultimo_visitante_nome = ultimoPerfil?.nome_completo ?? null;
  }

  const alvo = empresaId
    ? svc.from("empresas_visitadas").update(campos).eq("id", empresaId).eq("unidade_id", unidadeId)
    : svc.from("empresas_visitadas").update(campos).ilike("nome", nome).eq("unidade_id", unidadeId);
  const { error } = await alvo;
  if (error) throw new Error(error.message);
}
