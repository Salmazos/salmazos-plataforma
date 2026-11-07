import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoContestarSchema } from "@/lib/schemas";
import { exigirDiretoria, lancamentoNaUnidade } from "@/lib/comissaoAuth";
import { contestarLancamento } from "@/lib/comissao";

// A diretoria só contesta o que discordar (com motivo); sem contestação, vale a marcação. O beneficiário vê o status "contestada".
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const { id } = await params;
  if (!(await lancamentoNaUnidade(id, acesso.unidadeId))) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  const parsed = parseBody(comissaoContestarSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await contestarLancamento(createServiceClient(), { lancamentoId: id, motivo: parsed.data.motivo, ator: acesso.ator });
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ lancamento: r.lancamento });
}
