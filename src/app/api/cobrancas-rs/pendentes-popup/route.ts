import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFullAccess } from "@/lib/fullAccessAuth";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface CobrancaPendenteRow {
  id: string;
  tipo: "contratacao" | "cancelamento";
  cliente_nome_snapshot: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vagas: { titulo: string } | any;
}

// Diferente de PopupAsoPeriodicoHoje/PopupRescisoesHoje (orientados a evento-do-dia, via
// notificacoes_analista já targetada por user_id): cobrança R&S pendente é ESTADO
// PERSISTENTE, não evento datado — uma cobrança criada há dias e ainda pendente continua
// relevante hoje. Por isso consulta cobrancas_rs diretamente (não notificacoes_analista),
// e precisa da checagem de role aqui dentro (os popups de ASO/Rescisão não precisam,
// porque já vêm pré-filtrados por destinatário na origem da notificação). O dedup
// "1x por usuário por dia" (cobranca_rs_popup_visualizacoes) segue o mesmo padrão dos
// outros 3 popups — só essa parte é reaproveitável como está.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const acessoNegado = checarPapelFullAccess(user);
  if (acessoNegado) return NextResponse.json({ data: [], ja_visto: true });

  const svc = createServiceClient();

  const { data: pendentesRaw, error } = await svc
    .from("cobrancas_rs")
    .select("id, tipo, cliente_nome_snapshot, created_at, vagas(titulo)")
    .eq("status", "pendente_revisao")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pendentes = (pendentesRaw ?? []) as CobrancaPendenteRow[];

  const hojeISO = formatarDataISO(obterDataHojeBrasil());
  const { data: visto } = await svc
    .from("cobranca_rs_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  const data = pendentes.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    clienteNome: c.cliente_nome_snapshot,
    vagaTitulo: c.vagas?.titulo ?? "—",
    createdAt: c.created_at,
  }));

  return NextResponse.json({ data, ja_visto: !!visto });
}
