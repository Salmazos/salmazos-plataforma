import { NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { obterDataHojeBrasil, formatarDataISO } from "@/lib/dataHojeBrasil";
import { calcularVencimentoContratoMot, precisaAvisoPopupVencimentoMot, mensagemAvisoPopupVencimentoMot } from "@/lib/contratoMotStatus";

export const dynamic = "force-dynamic";

interface AvisoVencimentoMot {
  id: string;
  titulo: string;
  mensagem: string;
}

// Equivalente do portal para /api/funcionarios/vencimento-contrato/popup — mesma regra de
// negócio (contratoMotStatus.ts), só escopado ao cliente_id do usuário logado via
// cliente_usuarios. Sem link pra funcionário aqui (o portal não tem página de detalhe por
// funcionário) — o clique no popup leva pra /portal/vencimento-contrato.
export async function GET() {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!clienteUsuario) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const { data: funcionarios } = await service
    .from("funcionarios")
    .select("id, nome_completo, data_admissao")
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("tipo_servico", "mao_obra_temporaria")
    .eq("status", "ativo")
    .not("data_admissao", "is", null);

  const avisos: AvisoVencimentoMot[] = [];
  for (const f of funcionarios ?? []) {
    const v = calcularVencimentoContratoMot(f.data_admissao as string);
    if (precisaAvisoPopupVencimentoMot(v)) {
      avisos.push({
        id: f.id,
        titulo: f.nome_completo,
        mensagem: mensagemAvisoPopupVencimentoMot(v),
      });
    }
  }

  const hojeISO = formatarDataISO(obterDataHojeBrasil());
  const { data: visto } = await service
    .from("funcionario_vencimento_mot_popup_visualizacoes")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("data_referencia", hojeISO)
    .maybeSingle();

  return NextResponse.json({ data: avisos, ja_visto: !!visto });
}
