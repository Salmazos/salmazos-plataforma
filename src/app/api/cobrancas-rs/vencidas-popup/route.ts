import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface CobrancaVencidaRow {
  id: string;
  tipo: "contratacao" | "cancelamento";
  cliente_nome_snapshot: string;
  candidato_nome_snapshot: string | null;
  fee_valor: number | null;
  data_vencimento: string;
}

// Mesmo padrão estrutural de enviadas-popup/route.ts (gate por lista de destinatários
// configurável, independente de quem revisa cobrança), mas com uma diferença de
// comportamento: o "visto" aqui é por DIA (cobranca_rs_popup_vencida_ids_vistos tem
// data_referencia na chave de unicidade), então — ao contrário do popup de "enviada", que
// devolve a lista inteira + uma flag `temNovas` — aqui a query já devolve só o que ainda não
// foi visto HOJE; o que já foi visto hoje fica de fora, mas volta a aparecer amanhã se a
// fatura continuar vencida (nova data_referencia = nova "visualização" em potencial).
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
  if (!perfil) return NextResponse.json({ data: [] });

  const { data: destinatario } = await svc
    .from("cobranca_rs_destinatarios_popup_vencida")
    .select("id")
    .eq("analista_perfil_id", perfil.id)
    .eq("ativo", true)
    .maybeSingle();
  if (!destinatario) return NextResponse.json({ data: [] });

  const hoje = obterDataHojeBrasil();
  const hojeISO = formatarDataISO(hoje);

  const { data: vencidasRaw, error } = await svc
    .from("cobrancas_rs")
    .select("id, tipo, cliente_nome_snapshot, candidato_nome_snapshot, fee_valor, data_vencimento")
    .eq("status", "aprovada_enviada")
    .lt("data_vencimento", hojeISO)
    .order("data_vencimento", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vencidas = (vencidasRaw ?? []) as CobrancaVencidaRow[];
  if (vencidas.length === 0) return NextResponse.json({ data: [] });

  const { data: vistas } = await svc
    .from("cobranca_rs_popup_vencida_ids_vistos")
    .select("cobranca_id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .in("cobranca_id", vencidas.map((c) => c.id));

  const idsVistosHoje = new Set((vistas ?? []).map((v) => v.cobranca_id));
  const naoVistas = vencidas.filter((c) => !idsVistosHoje.has(c.id));

  const data = naoVistas.map((c) => {
    const diasAtraso = Math.round(
      (hoje.getTime() - new Date(c.data_vencimento + "T00:00:00").getTime()) / 86400000
    );
    return {
      id: c.id,
      tipo: c.tipo,
      clienteNome: c.cliente_nome_snapshot,
      candidatoNome: c.candidato_nome_snapshot,
      feeValor: c.fee_valor,
      dataVencimento: c.data_vencimento,
      diasAtraso,
    };
  });

  return NextResponse.json({ data });
}
