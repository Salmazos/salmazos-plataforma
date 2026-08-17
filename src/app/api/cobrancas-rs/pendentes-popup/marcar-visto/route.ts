import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Marca como vistas, pra este usuário, exatamente as pendências que estavam sendo
// mostradas no popup no momento do clique em "Ok, entendi!" (ids vêm do body — o próprio
// popup já tinha essa lista carregada, ver GET /pendentes-popup) — dedup agora é por
// pendência individual (cobranca_rs_popup_ids_vistos), não mais "1x por dia".
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ success: true });

  const svc = createServiceClient();
  const { error } = await svc
    .from("cobranca_rs_popup_ids_vistos")
    .upsert(
      ids.map((cobranca_id) => ({ usuario_id: user.id, cobranca_id })),
      { onConflict: "usuario_id,cobranca_id", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
