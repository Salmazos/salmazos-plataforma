import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const hojeISO = formatarDataISO(obterDataHojeBrasil());

  const svc = createServiceClient();
  const { error } = await svc
    .from("aniversario_popup_visualizacoes")
    .upsert(
      { usuario_id: user.id, data_referencia: hojeISO },
      { onConflict: "usuario_id,data_referencia", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
