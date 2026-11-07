import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirDiretoria } from "@/lib/comissaoAuth";
import { detalharFechamento } from "@/lib/comissaoFechamento";

// Resumo do fechamento por beneficiário: total, quantidade de cobranças, linhas (cliente/vaga/fee/comissão), atrasadas e ajustes.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirDiretoria();
  if (acesso instanceof Response) return acesso;
  const { id } = await params;
  try {
    const d = await detalharFechamento(createServiceClient(), { id, unidadeId: acesso.unidadeId });
    if (!d) return NextResponse.json({ error: "Fechamento não encontrado." }, { status: 404 });
    return NextResponse.json(d);
  } catch (e) {
    console.error("[GET /api/comissoes/fechamentos/[id]]", e);
    return NextResponse.json({ error: "Não foi possível carregar o fechamento." }, { status: 500 });
  }
}
