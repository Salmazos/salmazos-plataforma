import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { inicioJanelaAvisos } from "@/lib/avisoClienteRegras";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marca avisos como lidos e/ou vistos no popup, só para o usuário logado.
//   acao "lida"  → só lida_em        acao "popup" → só popup_visto_em        acao "ambos" (padrão) → os dois
// Corpo: { ids: [...] } ou { todos: true } (todos os avisos visíveis do cliente dele). Só vale para
// avisos do cliente do usuário (o cliente_id vem do servidor); ids de outros clientes são ignorados.
// Nunca sobrescreve um momento já registrado.
export async function POST(request: NextRequest) {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const acao: "lida" | "popup" | "ambos" = body?.acao === "lida" || body?.acao === "popup" ? body.acao : "ambos";
  const todos = body?.todos === true;
  const ids: string[] = Array.isArray(body?.ids)
    ? [...new Set<string>(body.ids.filter((id: unknown): id is string => typeof id === "string" && UUID.test(id)))].slice(0, 100)
    : [];
  if (!todos && ids.length === 0) return NextResponse.json({ success: true });

  const service = createServiceClient();
  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id, created_at")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  // Só avisos do cliente do usuário e dentro da janela visível a ele.
  let consulta = service
    .from("portal_avisos")
    .select("id")
    .eq("cliente_id", cu.cliente_id)
    .gte("created_at", inicioJanelaAvisos(cu.created_at))
    .limit(100);
  if (!todos) consulta = consulta.in("id", ids);
  const { data: avisos, error: erroAvisos } = await consulta;
  if (erroAvisos) return NextResponse.json({ error: "Erro ao marcar os avisos." }, { status: 500 });
  const validos = (avisos ?? []).map((a) => a.id);
  if (validos.length === 0) return NextResponse.json({ success: true });

  const { data: existentes } = await service
    .from("portal_avisos_estado")
    .select("aviso_id, lida_em, popup_visto_em")
    .eq("user_id", user.id)
    .in("aviso_id", validos);
  const porAviso = new Map((existentes ?? []).map((e) => [e.aviso_id, e]));

  const agora = new Date().toISOString();
  const linhas = validos.map((avisoId) => {
    const atual = porAviso.get(avisoId);
    return {
      aviso_id: avisoId,
      user_id: user.id,
      lida_em: atual?.lida_em ?? (acao === "popup" ? null : agora),
      popup_visto_em: atual?.popup_visto_em ?? (acao === "lida" ? null : agora),
    };
  });

  const { error } = await service.from("portal_avisos_estado").upsert(linhas, { onConflict: "aviso_id,user_id" });
  if (error) {
    console.error("[POST /api/portal/avisos/marcar]", error.message);
    return NextResponse.json({ error: "Erro ao marcar os avisos." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
