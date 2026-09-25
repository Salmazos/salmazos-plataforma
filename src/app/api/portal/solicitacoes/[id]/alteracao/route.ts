import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, solicitacaoVagaUpdateSchema } from "@/lib/schemas";
import { calcularAlteracoes, clientePodePedirAlteracao, resumoAlteracoesHtml } from "@/lib/solicitacaoAlteracao";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Cliente pede alteração numa solicitação que já enviou (pedido do Olver, 25/09). Não vale na
// hora: vira um pedido pendente em solicitacao_vaga_alteracoes, que a Salmazos aprova ou
// recusa (POST /api/solicitacoes-vagas/[id]/alteracao). Só enquanto a vaga está ativa, e um
// pedido novo substitui o pendente anterior.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createPortalClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const service = createServiceClient();
    const { data: cu } = await service
      .from("cliente_usuarios")
      .select("cliente_id")
      .eq("user_id", user.id)
      .single();
    if (!cu) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

    const { data: sol } = await service
      .from("solicitacoes_vagas")
      .select("*")
      .eq("id", id)
      .eq("cliente_id", cu.cliente_id)
      .maybeSingle();
    if (!sol) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });

    let vagaStatus: string | null = null;
    if (sol.vaga_id) {
      const { data: vaga } = await service.from("vagas").select("status").eq("id", sol.vaga_id).maybeSingle();
      vagaStatus = vaga?.status ?? null;
    }
    if (!clientePodePedirAlteracao(sol.status, vagaStatus)) {
      return NextResponse.json(
        { error: "Esta solicitação não pode mais ser alterada. Fale com a equipe da Salmazos." },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = parseBody(solicitacaoVagaUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const alteracoes = calcularAlteracoes(sol, parsed.data);
    if (Object.keys(alteracoes).length === 0) {
      return NextResponse.json({ error: "Nenhuma alteração em relação à solicitação atual." }, { status: 400 });
    }

    // Pedido novo substitui o pendente anterior (índice único garante um pendente só).
    await service
      .from("solicitacao_vaga_alteracoes")
      .update({ status: "substituida", decidido_em: new Date().toISOString() })
      .eq("solicitacao_vaga_id", id)
      .eq("status", "pendente");

    const { data: pedido, error } = await service
      .from("solicitacao_vaga_alteracoes")
      .insert({
        solicitacao_vaga_id: id,
        unidade_id: sol.unidade_id,
        alteracoes,
        solicitado_por_user_id: user.id,
      })
      .select("id")
      .single();
    if (error || !pedido) {
      return NextResponse.json({ error: error?.message ?? "Erro ao registrar o pedido." }, { status: 500 });
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: user.email ?? null,
      acao: "solicitacao_vaga_alteracao_pedida",
      entidade: "solicitacoes_vagas",
      entidade_id: id,
      detalhes: { cliente: sol.cliente_nome, pedido_id: pedido.id, alteracoes },
    });

    const campos = Object.keys(alteracoes).length;
    await service.from("notificacoes_analista").insert({
      tipo: "alteracao_solicitacao_vaga",
      titulo: `✏️ ${sol.cliente_nome ?? "Cliente"} pediu alteração na solicitação`,
      mensagem: `${sol.cliente_nome ?? "O cliente"} pediu ${campos} alteraç${campos === 1 ? "ão" : "ões"} na solicitação de ${sol.cargo} — aguardando aprovação.`,
      user_id: null,
      candidato_id: null,
      solicitacao_vaga_id: id,
      unidade_id: sol.unidade_id,
    });

    const template = getEmailTemplate("alteracao_solicitacao_pedida", {
      nome: "",
      cargo: sol.cargo,
      nomeCliente: sol.cliente_nome ?? undefined,
      resumoAlteracoesHtml: resumoAlteracoesHtml(alteracoes),
      solicitacaoUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/painel/vagas?solicitacao=${id}`,
    });
    await notifyAllAnalysts({
      subject: template.subject,
      html: template.html,
      tipo: "alteracao_solicitacao_pedida",
      unidadeId: sol.unidade_id,
    });

    return NextResponse.json({ ok: true, pedido_id: pedido.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/portal/solicitacoes/[id]/alteracao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
