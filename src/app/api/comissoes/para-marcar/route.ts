import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirBeneficiario } from "@/lib/comissaoAuth";
import { listarCobrancasParaMarcar } from "@/lib/comissao";

// "Cobranças para marcar": todas as cobranças R&S de contratação já enviadas para validação com competência no mês corrente, com o mínimo
// para o beneficiário reconhecer a cobrança e calcular a comissão (cliente, vaga/cargo, quem gerou, envio, status, fee). A única
// autorização é ser beneficiário ativo com a aba "comissoes_minhas": não exige acesso a Cobranças R&S. Cobranças já marcadas por
// outra pessoa vêm como "outro", sem a comissão alheia.
export async function GET() {
  const acesso = await exigirBeneficiario();
  if (acesso instanceof Response) return acesso;
  try {
    const cobrancas = await listarCobrancasParaMarcar(createServiceClient(), { beneficiario: acesso.beneficiario });
    return NextResponse.json({ cobrancas });
  } catch (e) {
    console.error("[GET /api/comissoes/para-marcar]", e);
    return NextResponse.json({ error: "Não foi possível carregar as cobranças." }, { status: 500 });
  }
}
