import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirBeneficiario } from "@/lib/comissaoAuth";
import { estadoDaCobranca } from "@/lib/comissao";

// Estado da comissão de uma cobrança para o quadro "Esta comissão é minha" (só para beneficiário; os demais recebem 403 e a tela
// simplesmente não mostra o quadro).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirBeneficiario();
  if (acesso instanceof Response) return acesso;
  const { id } = await params;
  try {
    return NextResponse.json(await estadoDaCobranca(createServiceClient(), { cobrancaId: id, beneficiario: acesso.beneficiario }));
  } catch (e) {
    console.error("[GET /api/comissoes/cobranca/[id]]", e);
    return NextResponse.json({ error: "Não foi possível carregar a comissão." }, { status: 500 });
  }
}
