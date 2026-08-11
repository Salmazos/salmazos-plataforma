import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";

// Limites do mês em Brasília (UTC-3 fixo — Brasil não tem mais horário de verão), pra
// filtrar cobrancas_rs.pago_em corretamente mesmo perto da virada do dia/mês em UTC.
function limitesMesBrasil(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = new Date(`${ano}-${String(mes).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
  const proxMes = mes === 12 ? 1 : mes + 1;
  const anoProx = mes === 12 ? ano + 1 : ano;
  const fim = new Date(`${anoProx}-${String(proxMes).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
  return { inicio, fim };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Faturamento R&S é restrito a PAPEIS_FULL_ACCESS diretamente — não usa
  // checarAcessoCobrancaRS, então analistas com acesso configurável só à tela de
  // Cobranças R&S (ex: Giovanni) não têm acesso aqui.
  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Parâmetros ano/mes inválidos." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { inicio, fim } = limitesMesBrasil(ano, mes);

  const { data: cobrancas, error } = await svc
    .from("cobrancas_rs")
    .select("id, cliente_nome_snapshot, candidato_nome_snapshot, tipo, fee_valor, pago_em")
    .eq("status", "paga")
    .gte("pago_em", inicio)
    .lt("pago_em", fim)
    .order("pago_em", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: imposto } = await svc
    .from("faturamento_rs_impostos_mensais")
    .select("ano, mes, percentual, atualizado_em")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  const receitaBruta = (cobrancas ?? []).reduce((soma, c) => soma + (c.fee_valor ?? 0), 0);

  return NextResponse.json({
    cobrancas: cobrancas ?? [],
    receitaBruta,
    imposto: imposto ?? null,
  });
}
