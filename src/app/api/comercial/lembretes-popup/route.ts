import { popupEventoLigado } from "@/lib/avisoConfiguravel";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";
import { buscarLembretesVencidos, buscarOportunidadesAbertasVencidas, type LembreteVencido } from "@/lib/lembretesComercial";

export const dynamic = "force-dynamic";

// Molde de /api/supervisao/pendentes-popup: estado atual + "já visto hoje" por usuário.
// Só vendedor tem lembretes; para os demais responde vazio e "já visto" (o popup não abre).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { ctx } = await exigirContextoComercial(user);
  if (!ctx || !ctx.vendedor) return NextResponse.json({ data: [], ja_visto: true });

  const svc = createServiceClient();

  // Canal popup do evento lembrete_comercial (Configurações > Avisos): sem linha ou erro de leitura = não mostra.
  if (!(await popupEventoLigado(svc, "lembrete_comercial"))) return NextResponse.json({ data: [], ja_visto: true });
  const hoje = hojeSaoPaulo();
  try {
    const lembretes = await buscarLembretesVencidos(svc, ctx.analistaId, hoje, 100);
    // Oportunidades abertas com a próxima ação de hoje ou vencida entram no mesmo formato; empresa que já tem lembrete
    // não repete. Ordem final: do vencimento mais antigo para o mais recente.
    const oportunidades = await buscarOportunidadesAbertasVencidas(svc, hoje, { vendedorId: ctx.analistaId, limite: 100 });
    const empresasComLembrete = new Set(lembretes.map((l) => l.empresa_visitada_id).filter((x): x is string => !!x));
    const daOportunidade: LembreteVencido[] = oportunidades
      .filter((o) => !o.empresa_visitada_id || !empresasComLembrete.has(o.empresa_visitada_id))
      .map((o) => ({
        id: `oportunidade-${o.id}`,
        empresa_visitada_id: o.empresa_visitada_id,
        oportunidade_id: o.id,
        contato_id: null,
        tipo: "proxima_acao",
        data_lembrete: o.proxima_acao_em,
        texto: null,
        empresa_nome: o.empresa,
      }));
    const itens = [...lembretes, ...daOportunidade].sort((a, b) => a.data_lembrete.localeCompare(b.data_lembrete));
    const { data: visto } = await svc
      .from("lembretes_popup_visualizacoes")
      .select("id")
      .eq("usuario_id", user.id)
      .eq("data_referencia", hoje)
      .maybeSingle();
    return NextResponse.json({ data: itens, ja_visto: !!visto });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao buscar lembretes." }, { status: 500 });
  }
}
