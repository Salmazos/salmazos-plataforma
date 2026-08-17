import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoCobrancaRS } from "@/lib/fullAccessAuth";

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
// relevante hoje. Por isso consulta cobrancas_rs diretamente, e precisa da checagem de
// acesso aqui dentro.
//
// Dedup por PENDÊNCIA INDIVIDUAL (cobranca_rs_popup_ids_vistos, unique
// usuario_id+cobranca_id) em vez de "1x por dia": uma cobrança nova (nunca vista por esse
// usuário) sempre dispara o popup de novo, mesmo que outras já tenham sido vistas hoje —
// senão uma segunda contratação no mesmo dia ficaria sem aviso até o dia seguinte.
//
// Quem não tem acesso amplo (checarAcessoCobrancaRS) só vê as pendências que ele mesmo
// gerou (cobrancas_rs.gerado_por_user_id) — mesma regra de podeRevisarCobranca usada nas
// rotas de detalhe/edição/aprovação de uma cobrança específica.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const acessoAmplo = await checarAcessoCobrancaRS(user);

  let query = svc
    .from("cobrancas_rs")
    .select("id, tipo, cliente_nome_snapshot, created_at, vagas(titulo)")
    .eq("status", "pendente_revisao")
    .order("created_at", { ascending: true });
  if (!acessoAmplo) query = query.eq("gerado_por_user_id", user.id);

  const { data: pendentesRaw, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pendentes = (pendentesRaw ?? []) as CobrancaPendenteRow[];
  if (pendentes.length === 0) return NextResponse.json({ data: [], temNovas: false });

  const { data: vistas } = await svc
    .from("cobranca_rs_popup_ids_vistos")
    .select("cobranca_id")
    .eq("usuario_id", user.id)
    .in("cobranca_id", pendentes.map((c) => c.id));

  const idsVistos = new Set((vistas ?? []).map((v) => v.cobranca_id));
  const temNovas = pendentes.some((c) => !idsVistos.has(c.id));

  const data = pendentes.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    clienteNome: c.cliente_nome_snapshot,
    vagaTitulo: c.vagas?.titulo ?? "—",
    createdAt: c.created_at,
  }));

  return NextResponse.json({ data, temNovas });
}
