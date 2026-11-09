import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, comissaoMarcarSchema } from "@/lib/schemas";
import { exigirBeneficiario } from "@/lib/comissaoAuth";
import { marcarComissao } from "@/lib/comissao";

// "Esta comissão é minha": o beneficiário marca a cobrança explicitamente (o sistema nunca deduz por vaga.responsavel). A autorização
// é só ser beneficiário ativo com a aba "comissoes_minhas" — NÃO exige acesso a Cobranças R&S, porque a comissão pode ser de um
// analista e a cobrança ter sido gerada por outro. Só vale cobrança do mês corrente: mês anterior volta 409 "mes_encerrado".
export async function POST(request: NextRequest) {
  const acesso = await exigirBeneficiario();
  if (acesso instanceof Response) return acesso;
  const parsed = parseBody(comissaoMarcarSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await marcarComissao(createServiceClient(), {
    cobrancaId: parsed.data.cobranca_id,
    beneficiario: acesso.beneficiario,
    ator: acesso.ator,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, codigo: r.codigo }, { status: r.status });
  return NextResponse.json({ lancamento: r.lancamento }, { status: 201 });
}
