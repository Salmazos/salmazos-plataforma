import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirDiretoria } from "@/lib/comissaoAuth";
import { csvDoFechamento, detalharFechamento } from "@/lib/comissaoFechamento";

// CSV para a folha: exatamente as linhas da tela do fechamento, valores assinados (estorno negativo) e um TOTAL por beneficiário.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const { id } = await params;
  try {
    const d = await detalharFechamento(createServiceClient(), { id, unidadeId: acesso.unidadeId });
    if (!d) return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 });
    const nome = `comissoes-${d.fechamento.competencia.slice(0, 7)}-${d.fechamento.unidade ?? "unidade"}.csv`;
    return new Response(csvDoFechamento(d.grupos), {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[GET /api/comissoes/fechamentos/[id]/csv]", e);
    return NextResponse.json({ error: "Não foi possível gerar o CSV." }, { status: 500 });
  }
}
