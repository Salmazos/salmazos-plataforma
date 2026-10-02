import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoComercial, hojeSaoPaulo, somarDias, ETAPAS_ABERTAS } from "@/lib/comercial";
import { buscarLembretesVencidos } from "@/lib/lembretesComercial";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  // Gestor sem perfil comercial acompanha pelo Funil; "Meu dia" é só de quem vende.
  if (!ctx.vendedor) return NextResponse.json({ data: { hoje: [], atrasadas: [], semRetorno: [], lembretes: [] }, vendedor: false });

  const svc = createServiceClient();
  const hoje = hojeSaoPaulo();

  const { data: abertas, error } = await svc
    .from("oportunidades")
    .select("*")
    .eq("vendedor_id", ctx.analistaId)
    .in("etapa", ETAPAS_ABERTAS)
    .order("proxima_acao_em", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lista = abertas ?? [];
  const deHoje = lista.filter((o) => o.proxima_acao_em === hoje);
  const atrasadas = lista.filter((o) => o.proxima_acao_em && o.proxima_acao_em < hoje);

  // Empresas da carteira (da unidade) que este vendedor visitou por último, há mais de 30 dias,
  // e que não têm oportunidade aberta dele — candidatas a retomar contato.
  let semRetorno: unknown[] = [];
  if (ctx.unidadeId) {
    const corte = `${somarDias(hoje, -30)}T23:59:59-03:00`;
    const { data: carteira } = await svc
      .from("empresas_visitadas")
      .select("id, nome, contato_nome, contato_telefone, ultima_visita_em, total_visitas, cliente_id")
      .eq("unidade_id", ctx.unidadeId)
      .eq("ultimo_visitante_id", ctx.userId)
      .lt("ultima_visita_em", corte)
      .gt("total_visitas", 0)
      .order("ultima_visita_em", { ascending: true })
      .limit(100);
    // Compara pelo id da empresa da Carteira (não mais pelo nome em minúsculas).
    const comOportunidade = new Set(lista.map((o) => o.empresa_visitada_id as string | null).filter(Boolean));
    semRetorno = (carteira ?? []).filter((e) => !e.cliente_id && !comOportunidade.has(e.id as string));
  }

  // Lembretes pendentes vencidos/de hoje do próprio vendedor. "Já tem oportunidade aberta" olha a
  // unidade inteira (qualquer vendedor), pois só pode haver uma aberta por empresa.
  let lembretes: unknown[] = [];
  try {
    const vencidos = await buscarLembretesVencidos(svc, ctx.analistaId, hoje, 100);
    const empresaIds = [...new Set(vencidos.map((l) => l.empresa_visitada_id).filter((x): x is string => !!x))];
    let comAberta = new Set<string>();
    if (empresaIds.length > 0) {
      let qAbertas = svc.from("oportunidades").select("empresa_visitada_id").in("empresa_visitada_id", empresaIds).in("etapa", ETAPAS_ABERTAS);
      if (ctx.unidadeId) qAbertas = qAbertas.eq("unidade_id", ctx.unidadeId);
      const { data: abertasEmpresa } = await qAbertas;
      comAberta = new Set((abertasEmpresa ?? []).map((o) => o.empresa_visitada_id as string));
    }
    lembretes = vencidos.map((l) => ({ ...l, empresa_tem_oportunidade_aberta: !!l.empresa_visitada_id && comAberta.has(l.empresa_visitada_id) }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao buscar lembretes." }, { status: 500 });
  }

  return NextResponse.json({ data: { hoje: deHoje, atrasadas, semRetorno, lembretes }, vendedor: true, hojeData: hoje });
}
