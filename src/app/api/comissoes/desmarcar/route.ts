import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoDesmarcarSchema } from "@/lib/schemas";
import { exigirBeneficiario } from "@/lib/comissaoAuth";
import { desmarcarComissao } from "@/lib/comissao";

// O beneficiário desmarca (o lançamento vira "cancelada", nunca é apagado) só enquanto a cobrança não foi validada.
export async function POST(request: NextRequest) {
  const acesso = await exigirBeneficiario();
  if (acesso instanceof Response) return acesso;
  const parsed = parseBody(comissaoDesmarcarSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await desmarcarComissao(createServiceClient(), { lancamentoId: parsed.data.lancamento_id, beneficiario: acesso.beneficiario, ator: acesso.ator });
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ lancamento: r.lancamento });
}
