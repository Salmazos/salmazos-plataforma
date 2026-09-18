import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

// Mesmo mecanismo de /api/funcionario-aso-avisos/hoje/marcar-visto — "visto" por dia, não
// por funcionário: reabre amanhã se ainda houver algo pendente (nunca dispensa de vez um
// aviso de risco legal, mesmo que o usuário já tenha visto ontem).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const hojeISO = formatarDataISO(obterDataHojeBrasil());

  const svc = createServiceClient();
  const { error } = await svc
    .from("funcionario_vencimento_mot_popup_visualizacoes")
    .upsert(
      { usuario_id: user.id, data_referencia: hojeISO },
      { onConflict: "usuario_id,data_referencia", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
