import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, solicitacaoAlteracaoDecisaoSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { aplicarAlteracoesSolicitacao, resumoAlteracoesHtml, type Alteracoes } from "@/lib/solicitacaoAlteracao";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";

interface Params {
  params: Promise<{ id: string }>;
}

// Decisão da Salmazos sobre o pedido de alteração pendente que o cliente fez pelo portal.
// Aprovar: aplica na solicitação e, se já houver vaga, na vaga (mesma regra da edição feita pela
// equipe — lib/solicitacaoAlteracao.ts). Recusar: nada muda. Nos dois casos o cliente recebe
// e-mail (pedido do Olver, 25/09).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const body = await request.json();
    const parsed = parseBody(solicitacaoAlteracaoDecisaoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: sol } = await service.from("solicitacoes_vagas").select("*").eq("id", id).maybeSingle();
    if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) {
      return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    }

    const { data: pedido } = await service
      .from("solicitacao_vaga_alteracoes")
      .select("id, alteracoes")
      .eq("solicitacao_vaga_id", id)
      .eq("status", "pendente")
      .maybeSingle();
    if (!pedido) {
      return NextResponse.json({ error: "Não há pedido de alteração pendente nesta solicitação." }, { status: 409 });
    }

    const usuarioNome = (await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? "";
    const alteracoes = pedido.alteracoes as Alteracoes;

    // Trava de corrida: só decide se o pedido ainda está pendente (o cliente pode ter enviado
    // uma versão nova, que substitui esta, no meio do caminho).
    const decisao = parsed.data.acao === "aprovar" ? "aprovada" : "recusada";
    const { data: decidido } = await service
      .from("solicitacao_vaga_alteracoes")
      .update({
        status: decisao,
        decidido_por: usuarioNome,
        decidido_em: new Date().toISOString(),
        motivo_recusa: parsed.data.acao === "recusar" ? parsed.data.motivo : null,
      })
      .eq("id", pedido.id)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();
    if (!decidido) {
      return NextResponse.json({ error: "O pedido mudou enquanto era analisado. Recarregue a lista." }, { status: 409 });
    }

    let solicitacaoAtualizada: Record<string, unknown> = sol;
    let vagaAtualizada = false;
    let erroVaga = false;
    if (decisao === "aprovada") {
      const resultado = await aplicarAlteracoesSolicitacao(sol, alteracoes, usuarioNome, service);
      if (!resultado.data) {
        // A solicitação mudou de status entre a leitura e a gravação — desfaz a decisão pra o
        // pedido voltar a aparecer como pendente, em vez de ficar "aprovado" sem ter sido aplicado.
        await service
          .from("solicitacao_vaga_alteracoes")
          .update({ status: "pendente", decidido_por: null, decidido_em: null })
          .eq("id", pedido.id);
        return NextResponse.json({ error: "A solicitação mudou de status. Recarregue e tente de novo." }, { status: 409 });
      }
      solicitacaoAtualizada = resultado.data;
      vagaAtualizada = resultado.vagaAtualizada;
      erroVaga = resultado.erroVaga;
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: decisao === "aprovada" ? "solicitacao_vaga_alteracao_aprovada" : "solicitacao_vaga_alteracao_recusada",
      entidade: "solicitacoes_vagas",
      entidade_id: id,
      detalhes: {
        cliente: sol.cliente_nome,
        pedido_id: pedido.id,
        alteracoes,
        vaga_atualizada: vagaAtualizada ? sol.vaga_id : null,
        motivo: parsed.data.acao === "recusar" ? parsed.data.motivo : null,
      },
    });

    // E-mail pro contato do cliente — falha aqui não desfaz a decisão, só vai pro log.
    if (sol.cliente_id) {
      const { data: cliente } = await service.from("clientes").select("contato_email").eq("id", sol.cliente_id).maybeSingle();
      if (cliente?.contato_email) {
        const template = getEmailTemplate(
          decisao === "aprovada" ? "alteracao_solicitacao_aprovada" : "alteracao_solicitacao_recusada",
          {
            nome: "",
            cargo: sol.cargo,
            nomeCliente: sol.cliente_nome ?? undefined,
            resumoAlteracoesHtml: resumoAlteracoesHtml(alteracoes),
            motivoRecusa: parsed.data.acao === "recusar" ? parsed.data.motivo : undefined,
          }
        );
        const envio = await sendEmail({
          to: cliente.contato_email,
          subject: template.subject,
          html: template.html,
          tipo: decisao === "aprovada" ? "alteracao_solicitacao_aprovada" : "alteracao_solicitacao_recusada",
        });
        if (!envio.success) {
          console.error(`[alteracao] E-mail ao cliente não enviado (solicitacao_id=${id}):`, envio.error);
        }
      }
    }

    if (erroVaga) {
      return NextResponse.json(
        { data: solicitacaoAtualizada, error: "Alterações aprovadas na solicitação, mas a vaga não foi atualizada. Ajuste a vaga pela tela de Vagas." },
        { status: 500 }
      );
    }
    return NextResponse.json({ data: solicitacaoAtualizada, decisao, vaga_atualizada: vagaAtualizada });
  } catch (err) {
    console.error("[POST /api/solicitacoes-vagas/[id]/alteracao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
