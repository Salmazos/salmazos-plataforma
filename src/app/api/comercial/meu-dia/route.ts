import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoComercial, hojeSaoPaulo, somarDias, ETAPAS_ABERTAS } from "@/lib/comercial";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { ctx, erro } = await exigirContextoComercial(user);
  if (erro) return erro;
  // Gestor sem perfil comercial acompanha pelo Funil; "Meu dia" é só de quem vende.
  if (!ctx.vendedor) return NextResponse.json({ data: { hoje: [], atrasadas: [], semRetorno: [] }, vendedor: false });

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
    const comOportunidade = new Set(lista.map((o) => String(o.empresa).trim().toLowerCase()));
    semRetorno = (carteira ?? []).filter((e) => !e.cliente_id && !comOportunidade.has(String(e.nome).trim().toLowerCase()));
  }

  return NextResponse.json({ data: { hoje: deHoje, atrasadas, semRetorno }, vendedor: true, hojeData: hoje });
}
