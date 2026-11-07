import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoRetroativoDecisaoSchema } from "@/lib/schemas";
import { exigirDiretoria, lancamentoNaUnidade } from "@/lib/comissaoAuth";
import { decidirRetroativo } from "@/lib/comissao";

// Aprovar ou recusar um pedido retroativo (cobrança de mês passado marcada depois). Registra quem decidiu e quando.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const { id } = await params;
  if (!(await lancamentoNaUnidade(id, acesso.unidadeId))) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const parsed = parseBody(comissaoRetroativoDecisaoSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await decidirRetroativo(createServiceClient(), {
    lancamentoId: id,
    decisao: parsed.data.decisao,
    motivo: parsed.data.decisao === "recusar" ? parsed.data.motivo : undefined,
    ator: acesso.ator,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ lancamento: r.lancamento });
}
