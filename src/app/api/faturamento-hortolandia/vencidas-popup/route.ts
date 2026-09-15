import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";

export const dynamic = "force-dynamic";

interface ContaVencidaRow {
  id: string;
  cliente_id: string;
  numero_nf: string | null;
  valor: number;
  data_vencimento: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientes: any;
}

// "Visto" aqui é PERMANENTE (conta_receber_hortolandia_popup_vistos não tem data_referencia
// na chave, diferente de cobranca_rs_popup_vencida_ids_vistos) — pedido explícito do
// usuário pra não repetir o popup todo dia: uma vez dispensado, o lançamento não aparece
// mais aqui, mesmo que continue vencido e pendente.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoHortolandia(user);
  if (acessoNegado) return NextResponse.json({ data: [] });

  const svc = createServiceClient();
  const hojeISO = formatarDataISO(obterDataHojeBrasil());

  const { data: vencidasRaw, error } = await svc
    .from("contas_receber_hortolandia")
    .select("id, cliente_id, numero_nf, valor, data_vencimento, clientes(nome)")
    .eq("status", "pendente")
    .lt("data_vencimento", hojeISO)
    .order("data_vencimento", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vencidas = (vencidasRaw ?? []) as ContaVencidaRow[];
  if (vencidas.length === 0) return NextResponse.json({ data: [] });

  const { data: vistas } = await svc
    .from("conta_receber_hortolandia_popup_vistos")
    .select("conta_id")
    .eq("usuario_id", user.id)
    .in("conta_id", vencidas.map((c) => c.id));

  const idsVistos = new Set((vistas ?? []).map((v) => v.conta_id));
  const naoVistas = vencidas.filter((c) => !idsVistos.has(c.id));

  const hoje = obterDataHojeBrasil();
  const data = naoVistas.map((c) => {
    const diasAtraso = Math.round(
      (hoje.getTime() - new Date(c.data_vencimento + "T00:00:00").getTime()) / 86_400_000
    );
    return {
      id: c.id,
      clienteNome: (Array.isArray(c.clientes) ? c.clientes[0]?.nome : c.clientes?.nome) ?? "Cliente",
      numeroNf: c.numero_nf,
      valor: c.valor,
      dataVencimento: c.data_vencimento,
      diasAtraso,
    };
  });

  return NextResponse.json({ data });
}
