import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";

export const dynamic = "force-dynamic";

// Marca como vistas PRA SEMPRE (sem data_referencia — ver vencidas-popup/route.ts) as
// contas que estavam sendo mostradas: diferente do popup de Cobrança R&S, este não
// reaparece amanhã se o lançamento continuar vencido.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Faltava aqui — era a única rota do módulo sem essa trava (auditoria de acesso,
  // set/2026). Não expõe dado financeiro (é só escrita, marca popup como visto), mas
  // permitia qualquer usuário autenticado gravar linhas em conta_receber_hortolandia_
  // popup_vistos, inconsistente com o restante do módulo ser diretoria/superuser-only.
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ success: true });

  const svc = createServiceClient();
  const { error } = await svc
    .from("conta_receber_hortolandia_popup_vistos")
    .upsert(
      ids.map((conta_id) => ({ usuario_id: user.id, conta_id })),
      { onConflict: "usuario_id,conta_id", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
