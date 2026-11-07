import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoResolverContestacaoSchema } from "@/lib/schemas";
import { exigirDiretoria, lancamentoNaUnidade } from "@/lib/comissaoAuth";
import { resolverContestacao } from "@/lib/comissao";

// Decisão manual da diretoria sobre uma comissão contestada: mantém, ajusta o valor (via ajuste) ou remove (via estorno).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const { id } = await params;
  if (!(await lancamentoNaUnidade(id, acesso.unidadeId))) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const parsed = parseBody(comissaoResolverContestacaoSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await resolverContestacao(createServiceClient(), { lancamentoId: id, acao: parsed.data.acao, valor: parsed.data.valor, nota: parsed.data.nota, ator: acesso.ator });
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ lancamento: r.lancamento, ajuste: r.ajuste });
}
