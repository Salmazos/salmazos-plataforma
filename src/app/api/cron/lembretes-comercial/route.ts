import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hojeSaoPaulo } from "@/lib/comercial";

export const dynamic = "force-dynamic";

// Aviso diário (sino, sem e-mail) para quem tem lembrete do Comercial vencido ou de hoje. Repete todo
// dia enquanto houver pendente — some quando o vendedor conclui, adia ou cancela.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const hoje = hojeSaoPaulo();

    const { data: pendentes, error } = await supabase
      .from("lembretes")
      .select("vendedor_id, empresa_visitada_id")
      .eq("status", "pendente")
      .lte("data_lembrete", hoje);
    if (error) {
      console.error("[cron/lembretes-comercial] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Empresas distintas por vendedor (dois lembretes da mesma empresa contam uma vez).
    const empresasPorVendedor = new Map<string, Set<string>>();
    let semEmpresa = 0;
    for (const l of pendentes ?? []) {
      const set = empresasPorVendedor.get(l.vendedor_id as string) ?? new Set<string>();
      set.add((l.empresa_visitada_id as string | null) ?? `sem-empresa-${semEmpresa++}`);
      empresasPorVendedor.set(l.vendedor_id as string, set);
    }
    const vendedorIds = [...empresasPorVendedor.keys()];
    if (vendedorIds.length === 0) return NextResponse.json({ vendedores: 0, avisos_enviados: 0, ja_avisados: 0 });

    const { data: perfis } = await supabase
      .from("analistas_perfil")
      .select("id, user_id, ativo")
      .in("id", vendedorIds);
    const userPorVendedor = new Map(
      (perfis ?? []).filter((p) => p.user_id && p.ativo !== false).map((p) => [p.id as string, p.user_id as string])
    );

    // Não duplica se o cron rodar duas vezes no mesmo dia (início do dia em Brasília).
    const inicioDoDia = `${hoje}T00:00:00-03:00`;
    const userIds = [...userPorVendedor.values()];
    const { data: jaAvisados } = userIds.length
      ? await supabase
          .from("notificacoes_analista")
          .select("user_id")
          .eq("tipo", "lembrete_comercial")
          .in("user_id", userIds)
          .gte("created_at", inicioDoDia)
      : { data: [] as { user_id: string }[] };
    const jaAvisadosSet = new Set((jaAvisados ?? []).map((n) => n.user_id as string));

    const novas = [...userPorVendedor.entries()]
      .filter(([, userId]) => !jaAvisadosSet.has(userId))
      .map(([vendedorId, userId]) => {
        const n = empresasPorVendedor.get(vendedorId)?.size ?? 1;
        return {
          tipo: "lembrete_comercial",
          titulo: "Hora de retomar contato",
          mensagem: `Você tem ${n} empresa${n !== 1 ? "s" : ""} esperando seu retorno.`,
          user_id: userId,
        };
      });

    if (novas.length > 0) {
      const { error: errNotif } = await supabase.from("notificacoes_analista").insert(novas);
      if (errNotif) {
        console.error("[cron/lembretes-comercial] Erro ao gravar notificações:", errNotif.message);
        return NextResponse.json({ error: errNotif.message }, { status: 500 });
      }
    }

    return NextResponse.json({ vendedores: vendedorIds.length, avisos_enviados: novas.length, ja_avisados: jaAvisadosSet.size });
  } catch (err) {
    console.error("[GET /api/cron/lembretes-comercial]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
