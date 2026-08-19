import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarAcessoFaturamentoRs } from "@/lib/faturamentoRsAuth";
import { obterReceitaMes } from "@/lib/faturamentoRS";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarAcessoFaturamentoRs(user);
  if (acessoNegado) return acessoNegado;

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
