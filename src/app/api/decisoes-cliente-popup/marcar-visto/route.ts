import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { TIPOS_NOTIFICACAO_POPUP } from "@/lib/decisaoClienteCandidato";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 50;

// Marca como vistos, para este usuário, os avisos internos que o popup mostrava (ou só o clicado).
// Só vale para linhas que PERTENCEM ao usuário logado (user_id vindo da sessão) e são de um tipo do popup (decisão do cliente ou garantia R&S);
// qualquer outro id é ignorado. Não mexe em `lida`: o sino continua como estava.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const brutos: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
  const ids = [...new Set(brutos.filter((i): i is string => typeof i === "string" && UUID.test(i)))].slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ success: true });

  const svc = createServiceClient();
  const { data: proprias, error: erroLeitura } = await svc
    .from("notificacoes_analista")
    .select("id")
    .eq("user_id", user.id)
    .in("tipo", [...TIPOS_NOTIFICACAO_POPUP])
    .in("id", ids);
  if (erroLeitura) return NextResponse.json({ error: erroLeitura.message }, { status: 500 });
  const validos = (proprias ?? []).map((p: { id: string }) => p.id);
  if (validos.length === 0) return NextResponse.json({ success: true });

  const { error } = await svc
    .from("notificacao_popup_vistos")
    .upsert(validos.map((id) => ({ notificacao_id: id, user_id: user.id })), { onConflict: "notificacao_id,user_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
