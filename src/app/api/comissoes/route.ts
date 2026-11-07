import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirDiretoria } from "@/lib/comissaoAuth";
import { listarLancamentos, listarRetroativosPendentes } from "@/lib/comissao";
import { competenciaAtual, competenciaDoMes } from "@/lib/comissaoRegras";

// Visão da diretoria/superuser: todas as comissões do mês (?mes=AAAA-MM), totais por pessoa e os pedidos retroativos pendentes.
export async function GET(request: NextRequest) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const competencia = competenciaDoMes(request.nextUrl.searchParams.get("mes")) ?? competenciaAtual();
  try {
    const svc = createServiceClient();
    const [r, retroativos] = await Promise.all([
      listarLancamentos(svc, { competencia, unidadeId: acesso.unidadeId }),
      listarRetroativosPendentes(svc, { unidadeId: acesso.unidadeId }),
    ]);
    return NextResponse.json({ competencia, ...r, retroativosPendentes: retroativos });
  } catch (e) {
    console.error("[GET /api/comissoes]", e);
    return NextResponse.json({ error: "Não foi possível carregar as comissões." }, { status: 500 });
  }
}
