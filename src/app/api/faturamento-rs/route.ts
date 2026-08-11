import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import { obterReceitaMes } from "@/lib/faturamentoRS";

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
  const dados = await obterReceitaMes(svc, ano, mes);

  return NextResponse.json(dados);
}
