import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolverAcessoComissoes, unidadeVisivelParaDiretoria } from "@/lib/comissaoAuth";
import { pendenciasDaDiretoria, pendenciasDoBeneficiario } from "@/lib/comissaoPendencias";

export const dynamic = "force-dynamic";

// Pendências de comissão para o popup ao entrar no painel: cada pessoa recebe só o que lhe cabe (beneficiário: o que falta lançar e as
// contestações; diretoria: contestações, fechamento liberado, fechamento sem pagamento e possíveis esquecimentos). Quem não tem acesso
// recebe tudo nulo (200), e o popup simplesmente não aparece. É estado lido do banco a cada chamada: nada de "visto" gravado que possa esconder uma pendência.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const acesso = await resolverAcessoComissoes(user);
    const svc = createServiceClient();
    const beneficiario = acesso.minhas && acesso.beneficiario ? await pendenciasDoBeneficiario(svc, { beneficiario: acesso.beneficiario, userId: user.id }) : null;
    let diretoria = null;
    if (acesso.diretoria) {
      const vis = await unidadeVisivelParaDiretoria(user);
      if (vis) diretoria = await pendenciasDaDiretoria(svc, { unidadeId: vis.unidadeId });
    }
    return NextResponse.json({ beneficiario, diretoria });
  } catch (e) {
    console.error("[GET /api/comissoes/pendencias]", e);
    return NextResponse.json({ beneficiario: null, diretoria: null });
  }
}
