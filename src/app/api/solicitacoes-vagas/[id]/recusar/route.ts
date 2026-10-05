import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { mensagemDecisaoSolicitacao } from "@/lib/solicitacaoVagaStatus";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { avisarSolicitacaoDecidida } from "@/lib/avisoClienteDecisao";
import { emailClienteLigado } from "@/lib/avisoCliente";
import { destinatariosEmailCliente } from "@/lib/destinatariosEmailCliente";
import { enviarEmailAoCliente } from "@/lib/enviarEmailAoCliente";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const body = await request.json();
    const { motivo_recusa } = body;

    if (!motivo_recusa?.trim()) {
      return NextResponse.json({ error: "Motivo da recusa é obrigatório." }, { status: 400 });
    }

    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const service = createServiceClient();

    const { data: solAtual } = await service
      .from("solicitacoes_vagas")
      .select("status, aprovada_por, aprovada_em, motivo_recusa, unidade_id")
      .eq("id", id)
      .single();

    if (!solAtual || !podeVerUnidade(ctx, solAtual.unidade_id)) {
      return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    }
    if (solAtual.status !== "pendente") {
      return NextResponse.json({ error: mensagemDecisaoSolicitacao(solAtual) }, { status: 409 });
    }

    const { data: perfil } = await service
      .from("analistas_perfil")
      .select("nome_completo")
      .eq("user_id", user.id)
      .single();

    const { data: sol, error } = await service
      .from("solicitacoes_vagas")
      .update({
        status: "recusada",
        motivo_recusa: motivo_recusa.trim(),
        aprovada_por: perfil?.nome_completo ?? user.email ?? "",
        aprovada_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("cliente_id, cliente_nome, cargo")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Interruptor "E-mail" (Configurações > Avisos) e destinatários = login de cada usuário do portal (sem
    // usuário, contato_email). cliente_id vem da solicitação gravada acima.
    if (sol?.cliente_id && (await emailClienteLigado("email_cliente_solicitacao_recusada", service))) {
      const destinatarios = await destinatariosEmailCliente(sol.cliente_id, service);

      if (destinatarios.length > 0) {
        const { subject, html } = getEmailTemplate("solicitacao_recusada", {
          nome: sol.cliente_nome ?? "",
          cargo: sol.cargo,
          nomeCliente: sol.cliente_nome ?? "",
          motivoRecusa: motivo_recusa.trim(),
        });
        await enviarEmailAoCliente(destinatarios, { subject, html, tipo: "solicitacao_recusada" }, `recusar solicitacao_id=${id}`);
      }
    }

    // Aviso no sino/popup do portal: extra, isolado (nunca lança), depois de a solicitação já estar recusada.
    await avisarSolicitacaoDecidida(service, id, "recusada");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/solicitacoes-vagas/[id]/recusar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
