import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";
import { calcularVencimentoContratoMot, precisaAvisoPopupVencimentoMot, mensagemAvisoPopupVencimentoMot } from "@/lib/contratoMotStatus";

export const dynamic = "force-dynamic";

interface AvisoVencimentoMot {
  id: string;
  funcionario_id: string;
  titulo: string;
  mensagem: string;
}

// Calculado em tempo real a cada carregamento (sem cron/tabela de notificação
// intermediária) — mesmo raciocínio de /api/faturamento-hortolandia/vencidas-popup: a
// regra de negócio (calcularVencimentoContratoMot) é a mesma usada no relatório
// /painel/vencimento-contrato, então o popup nunca mostra algo que a tela não mostraria.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const { data: funcionarios } = await svc
    .from("funcionarios")
    .select("id, nome_completo, data_admissao")
    .eq("tipo_servico", "mao_obra_temporaria")
    .eq("status", "ativo")
    .not("data_admissao", "is", null);

  const avisos: AvisoVencimentoMot[] = [];
  for (const f of funcionarios ?? []) {
    const v = calcularVencimentoContratoMot(f.data_admissao as string);
    if (precisaAvisoPopupVencimentoMot(v)) {
      avisos.push({
        id: f.id,
        funcionario_id: f.id,
        titulo: f.nome_completo,
        mensagem: mensagemAvisoPopupVencimentoMot(v),
      });
    }
  }

  const hojeISO = formatarDataISO(obterDataHojeBrasil());
  const { data: visto } = await svc
    .from("funcionario_vencimento_mot_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  return NextResponse.json({ data: avisos, ja_visto: !!visto });
}
