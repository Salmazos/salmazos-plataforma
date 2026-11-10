import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirBeneficiario } from "@/lib/comissaoAuth";
import { listarCobrancasParaMarcar } from "@/lib/comissao";
import { competenciaAtual, dentroDaFolga, mesAnteriorDe } from "@/lib/comissaoRegras";

// "Cobranças para marcar": todas as cobranças R&S de contratação já enviadas para validação do mês corrente (e, enquanto for dia 1–3, do mês anterior: prazo de lançamento), com o mínimo
// para o beneficiário reconhecer a cobrança e calcular a comissão (cliente, vaga/cargo, quem gerou, envio, status, fee). A única
// autorização é ser beneficiário ativo com a aba "comissoes_minhas": não exige acesso a Cobranças R&S. Cobranças já marcadas por
// outra pessoa vêm como "outro", sem a comissão alheia.
export async function GET() {
  const acesso = await exigirBeneficiario();
  if (acesso instanceof Response) return acesso;
  try {
    const cobrancas = await listarCobrancasParaMarcar(createServiceClient(), { beneficiario: acesso.beneficiario });
    // janela: aviso do topo da tela (prazo do mês anterior). Calculada aqui para a tela não decidir data por conta própria.
    const agora = new Date();
    const atual = competenciaAtual(agora);
    return NextResponse.json({ cobrancas, janela: { aberta: dentroDaFolga(agora), competencia_anterior: mesAnteriorDe(atual), prazo_ate: `${atual.slice(0, 8)}03` } });
  } catch (e) {
    console.error("[GET /api/comissoes/para-marcar]", e);
    return NextResponse.json({ error: "Não foi possível carregar as cobranças." }, { status: 500 });
  }
}
