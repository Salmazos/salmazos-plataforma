import { NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

// Equivalente do portal para /api/funcionarios/vencimento-contrato/popup/marcar-visto —
// mesma tabela compartilhada (usuario_id do usuário do portal nunca colide com usuario_id
// de analista, são sempre pessoas/contas diferentes no Supabase Auth).
export async function POST() {
  const supabase = await createPortalClient();
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
