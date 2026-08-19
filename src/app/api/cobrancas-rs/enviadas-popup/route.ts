import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CobrancaEnviadaRow {
  id: string;
  tipo: "contratacao" | "cancelamento";
  cliente_nome_snapshot: string;
  candidato_nome_snapshot: string | null;
  enviado_em: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vagas: { titulo: string } | any;
}

// Mesmo padrão estrutural de pendentes-popup/route.ts (dedup por notificação individual via
// tabela de "vistos" própria — cobranca_rs_popup_enviada_ids_vistos), mas evento e público
// diferentes: aqui é "cobrança aprovada/enviada", e o gate de acesso é só pertencer à lista
// de cobranca_rs_destinatarios_popup_enviada com ativo=true — não tem relação com
// checarAcessoCobrancaRS/podeRevisarCobranca (quem revisa cobrança não necessariamente quer
// esse popup, e vice-versa: um destinatário aqui pode nunca revisar nada).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: perfil } = await svc
    .from("analistas_perfil")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!perfil) return NextResponse.json({ data: [], temNovas: false });

  const { data: destinatario } = await svc
    .from("cobranca_rs_destinatarios_popup_enviada")
    .select("id")
    .eq("analista_perfil_id", perfil.id)
    .eq("ativo", true)
    .maybeSingle();
  if (!destinatario) return NextResponse.json({ data: [], temNovas: false });

  const { data: enviadasRaw, error } = await svc
    .from("cobrancas_rs")
    .select("id, tipo, cliente_nome_snapshot, candidato_nome_snapshot, enviado_em, vagas(titulo)")
    .eq("status", "aprovada_enviada")
    .order("enviado_em", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enviadas = (enviadasRaw ?? []) as CobrancaEnviadaRow[];
  if (enviadas.length === 0) return NextResponse.json({ data: [], temNovas: false });

  const { data: vistas } = await svc
    .from("cobranca_rs_popup_enviada_ids_vistos")
    .select("cobranca_id")
    .eq("usuario_id", user.id)
    .in("cobranca_id", enviadas.map((c) => c.id));

  const idsVistos = new Set((vistas ?? []).map((v) => v.cobranca_id));
  const temNovas = enviadas.some((c) => !idsVistos.has(c.id));

  const data = enviadas.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    clienteNome: c.cliente_nome_snapshot,
    candidatoNome: c.candidato_nome_snapshot,
    vagaTitulo: c.vagas?.titulo ?? "—",
    enviadoEm: c.enviado_em,
  }));

  return NextResponse.json({ data, temNovas });
}
