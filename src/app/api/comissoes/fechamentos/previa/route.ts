import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirDiretoria } from "@/lib/comissaoAuth";
import { previaFechamento } from "@/lib/comissaoFechamento";
import { competenciaAtual, competenciaDoMes } from "@/lib/comissaoRegras";

// Prévia do fechamento (?mes=AAAA-MM; padrão = mês atual): o que entra, o que bloqueia e por beneficiário. Não grava nada.
export async function GET(request: NextRequest) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const competencia = competenciaDoMes(request.nextUrl.searchParams.get("mes")) ?? competenciaAtual();
  try {
    return NextResponse.json({ competencia, unidades: await previaFechamento(createServiceClient(), { competencia, unidadeId: acesso.unidadeId }) });
  } catch (e) {
    console.error("[GET /api/comissoes/fechamentos/previa]", e);
    return NextResponse.json({ error: "Não foi possível montar a prévia." }, { status: 500 });
  }
}
