import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirContextoComercial, hojeSaoPaulo } from "@/lib/comercial";
import { buscarLembretesVencidos } from "@/lib/lembretesComercial";

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
  const hoje = hojeSaoPaulo();
  try {
    const lembretes = await buscarLembretesVencidos(svc, ctx.analistaId, hoje, 100);
    const { data: visto } = await svc
      .from("lembretes_popup_visualizacoes")
      .select("id")
      .eq("usuario_id", user.id)
      .eq("data_referencia", hoje)
      .maybeSingle();
    return NextResponse.json({ data: lembretes, ja_visto: !!visto });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao buscar lembretes." }, { status: 500 });
  }
}
