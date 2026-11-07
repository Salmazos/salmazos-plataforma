import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirBeneficiario } from "@/lib/comissaoAuth";
import { listarLancamentos } from "@/lib/comissao";
import { competenciaAtual, competenciaDoMes } from "@/lib/comissaoRegras";

// Minhas comissões: só os lançamentos do beneficiário logado, de um mês de competência (?mes=AAAA-MM; padrão = mês atual).
export async function GET(request: NextRequest) {
  const acesso = await exigirBeneficiario();
  if (acesso instanceof Response) return acesso;
  const competencia = competenciaDoMes(request.nextUrl.searchParams.get("mes")) ?? competenciaAtual();
  try {
    const r = await listarLancamentos(createServiceClient(), { competencia, beneficiarioId: acesso.beneficiario.id });
    return NextResponse.json({
      competencia,
      beneficiario: { id: acesso.beneficiario.id, nome: acesso.beneficiario.nome_completo, percentual: acesso.beneficiario.percentual },
      lancamentos: r.lancamentos,
      totais: r.totais,
    });
  } catch (e) {
    console.error("[GET /api/comissoes/minhas]", e);
    return NextResponse.json({ error: "Não foi possível carregar as comissões." }, { status: 500 });
  }
}
