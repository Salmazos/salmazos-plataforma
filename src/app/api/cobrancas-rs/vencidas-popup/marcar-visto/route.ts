import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

// Marca como vistas HOJE (data_referencia) as cobranças que estavam sendo mostradas — mesmo
// padrão de enviadas-popup/marcar-visto/route.ts, mas a chave de unicidade inclui a data, então
// esse "visto" só vale pra hoje: amanhã, se a fatura continuar vencida, ela reaparece.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ success: true });

  const hojeISO = formatarDataISO(obterDataHojeBrasil());

  const svc = createServiceClient();
  const { error } = await svc
    .from("cobranca_rs_popup_vencida_ids_vistos")
    .upsert(
      ids.map((cobranca_id) => ({ usuario_id: user.id, cobranca_id, data_referencia: hojeISO })),
      { onConflict: "usuario_id,cobranca_id,data_referencia", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
