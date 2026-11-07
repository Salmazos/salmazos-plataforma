import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoAjusteSchema } from "@/lib/schemas";
import { exigirDiretoria, lancamentoNaUnidade } from "@/lib/comissaoAuth";
import { criarAjuste } from "@/lib/comissao";

// Ajuste ou estorno vinculado a um lançamento de comissão (o original nunca é editado). Estorno após comissão paga é só registro:
// nada é descontado em folha nesta fase.
export async function POST(request: NextRequest) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const parsed = parseBody(comissaoAjusteSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!(await lancamentoNaUnidade(parsed.data.lancamento_origem_id, acesso.unidadeId))) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const r = await criarAjuste(createServiceClient(), {
    origemId: parsed.data.lancamento_origem_id,
    tipo: parsed.data.tipo,
    valor: parsed.data.valor,
    motivo: parsed.data.motivo,
    ator: acesso.ator,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ lancamento: r.lancamento }, { status: 201 });
}
