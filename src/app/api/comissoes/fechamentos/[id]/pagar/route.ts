import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoPagarSchema } from "@/lib/schemas";
import { exigirDiretoria } from "@/lib/comissaoAuth";
import { detalharFechamento, marcarPago } from "@/lib/comissaoFechamento";

// "Marcar como pago na folha": por fechamento, uma única vez, com a data informada (quem e quando ficam registrados). Não se desfaz.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const { id } = await params;
  const svc = createServiceClient();
  if (!(await detalharFechamento(svc, { id, unidadeId: acesso.unidadeId }))) return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 });
  const parsed = parseBody(comissaoPagarSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await marcarPago(svc, { fechamentoId: id, pagoEm: parsed.data.pago_em, ator: acesso.ator });
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ fechamento: r.fechamento });
}
