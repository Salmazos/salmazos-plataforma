import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hojeSaoPaulo } from "@/lib/comercial";
import { resolverDestinatarios } from "@/lib/avisos";
import {
  EVENTO_LEMBRETE_COMERCIAL,
  PREFIXO_MENSAGEM_VENDEDOR,
  TIPO_LEMBRETE_COMERCIAL,
  textoLembreteComercial,
  textoLembreteComercialGestao,
} from "@/lib/avisosRestantesRegras";

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
      .select("id, user_id, ativo, nome_completo")
      .in("id", vendedorIds);
    const userPorVendedor = new Map(
      (perfis ?? []).filter((p) => p.user_id && p.ativo !== false).map((p) => [p.id as string, p.user_id as string])
    );
    const nomePorVendedor = new Map((perfis ?? []).map((p) => [p.id as string, p.nome_completo as string | null]));

    // Sino (Configurações > Avisos > lembrete_comercial): sem linha de canal ou erro de leitura = ligado; só ativo = false
    // desliga tudo. A lista do canal (por exemplo a gestão comercial) recebe o mesmo aviso com o nome do vendedor.
    const sino = await resolverDestinatarios(EVENTO_LEMBRETE_COMERCIAL, "sino", undefined, supabase);
    if (sino.modo === "desligado") {
      return NextResponse.json({ vendedores: vendedorIds.length, avisos_enviados: 0, ja_avisados: 0, sino_desligado: true });
    }
    const listaGestao = sino.modo === "configurado" && !sino.falhou ? sino.userIds : [];

    // Não duplica se o cron rodar duas vezes no mesmo dia (início do dia em Brasília). O aviso do vendedor é reconhecido
    // pelo texto "Você tem…"; o da gestão, pelo par usuário + mensagem.
    const inicioDoDia = `${hoje}T00:00:00-03:00`;
    const userIds = [...new Set([...userPorVendedor.values(), ...listaGestao])];
    const { data: jaAvisados } = userIds.length
      ? await supabase
          .from("notificacoes_analista")
          .select("user_id, mensagem")
          .eq("tipo", TIPO_LEMBRETE_COMERCIAL)
          .in("user_id", userIds)
          .gte("created_at", inicioDoDia)
      : { data: [] as { user_id: string; mensagem: string }[] };
    const jaAvisadosSet = new Set((jaAvisados ?? []).filter((n) => String(n.mensagem ?? "").startsWith(PREFIXO_MENSAGEM_VENDEDOR)).map((n) => n.user_id as string));
    const jaGestao = new Set((jaAvisados ?? []).map((n) => `${n.user_id}|${n.mensagem}`));

    const novas: { tipo: string; titulo: string; mensagem: string; user_id: string }[] = [];
    for (const [vendedorId, userId] of userPorVendedor.entries()) {
      const n = empresasPorVendedor.get(vendedorId)?.size ?? 1;
      if (!jaAvisadosSet.has(userId)) novas.push({ tipo: TIPO_LEMBRETE_COMERCIAL, ...textoLembreteComercial({ quantidade: n }), user_id: userId });
      const gestao = textoLembreteComercialGestao({ vendedor: nomePorVendedor.get(vendedorId), quantidade: n });
      for (const gestorId of listaGestao) {
        if (gestorId === userId || jaGestao.has(`${gestorId}|${gestao.mensagem}`)) continue;
        novas.push({ tipo: TIPO_LEMBRETE_COMERCIAL, ...gestao, user_id: gestorId });
      }
    }

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
