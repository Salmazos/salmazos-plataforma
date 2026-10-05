import { NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { inicioJanelaAvisos, type AvisoPortal } from "@/lib/avisoClienteRegras";

export const dynamic = "force-dynamic";

// Avisos do portal do cliente (sino e popup). UMA consulta: os avisos do cliente do usuário logado nos
// últimos 30 dias (e só depois que este usuário entrou no portal), já com o estado dele (lida / popup
// visto) embutido. O cliente_id vem sempre do servidor (cliente_usuarios do usuário logado), nunca do
// pedido. Sem polling: o navegador chama ao carregar o portal e quando o usuário abre o menu do sino.
export async function GET() {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();
  const { data: cu } = await service
    .from("cliente_usuarios")
    .select("cliente_id, created_at")
    .eq("user_id", user.id)
    .single();
  if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data, error } = await service
    .from("portal_avisos")
    .select("id, titulo, mensagem, link, created_at, canal_sino, canal_popup, portal_avisos_estado(lida_em, popup_visto_em)")
    .eq("cliente_id", cu.cliente_id)
    .gte("created_at", inicioJanelaAvisos(cu.created_at))
    // Estado SÓ deste usuário (o filtro no recurso embutido não esconde o aviso, só o estado dos outros).
    .eq("portal_avisos_estado.user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[GET /api/portal/avisos]", error.message);
    return NextResponse.json({ error: "Erro ao carregar os avisos." }, { status: 500 });
  }

  const avisos: AvisoPortal[] = (data ?? []).map((a) => {
    const estado = (a.portal_avisos_estado as { lida_em: string | null; popup_visto_em: string | null }[] | null)?.[0];
    return {
      id: a.id,
      titulo: a.titulo,
      mensagem: a.mensagem,
      link: a.link,
      created_at: a.created_at,
      canal_sino: a.canal_sino,
      canal_popup: a.canal_popup,
      lida: !!estado?.lida_em,
      popup_visto: !!estado?.popup_visto_em,
    };
  });

  return NextResponse.json({ data: avisos });
}
