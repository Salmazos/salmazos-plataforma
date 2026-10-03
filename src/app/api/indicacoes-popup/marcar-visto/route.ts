import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marca como dispensadas, para este usuário, exatamente as indicações que o popup estava
// mostrando (mesmo padrão de /api/solicitacoes-vagas/pendentes-popup/marcar-visto).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string" && UUID.test(id)) : [];
  if (ids.length === 0) return NextResponse.json({ success: true });

  const svc = createServiceClient();
  const { error } = await svc
    .from("indicacao_candidato_popup_vistos")
    .upsert(
      ids.map((solicitacao_indicacao_id) => ({ usuario_id: user.id, solicitacao_indicacao_id })),
      { onConflict: "usuario_id,solicitacao_indicacao_id", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
