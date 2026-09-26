import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirAcessoVaga } from "@/lib/unidadeAuth";
import { parseBody, vagaSolicitacaoStatusDecisaoSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/sendEmail";
import { sincronizarPosicoesAbertas } from "@/lib/vagaPosicoes";

interface Params {
  params: Promise<{ id: string }>;
}

// Decisão da Salmazos sobre o pedido de pausa/reabertura que o cliente fez pelo portal (ver
// vagaPausaReativacao.ts). Aprovar aplica sempre o mesmo resultado do pedido (pausar → status
// 'pausada', reabrir → 'aberta') — nunca 'fechada'/'cancelada', que é decisão separada do
// analista pela tela de vaga normal. Recusar não muda a vaga. Cliente recebe e-mail nos dois
// casos (mesmo padrão da decisão de alteração de solicitação).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const bloqueio = await exigirAcessoVaga(id);
    if (bloqueio) return bloqueio;

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const body = await request.json();
    const parsed = parseBody(vagaSolicitacaoStatusDecisaoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: vaga } = await service
      .from("vagas")
      .select("id, status, cliente_id, cliente_nome_temp, titulo, clientes(nome)")
      .eq("id", id)
      .maybeSingle();
    if (!vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nomeClienteVaga = (vaga.clientes as any)?.nome ?? vaga.cliente_nome_temp ?? null;

    const { data: pedido } = await service
      .from("vaga_solicitacoes_status")
      .select("id, acao")
      .eq("vaga_id", id)
      .eq("status", "pendente")
      .maybeSingle();
    if (!pedido) {
      return NextResponse.json({ error: "Não há pedido de pausa/reativação pendente nesta vaga." }, { status: 409 });
    }

    const usuarioNome = (await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? "";
    const decisao = parsed.data.acao === "aprovar" ? "aprovada" : "recusada";

    // Trava de corrida: só decide se o pedido ainda está pendente.
    const { data: decidido } = await service
      .from("vaga_solicitacoes_status")
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

    let vagaAtualizada = false;
    if (decisao === "aprovada") {
      const novoStatus = pedido.acao === "pausar" ? "pausada" : "aberta";
      const campos: Record<string, unknown> =
        // Mesma lógica de datas do PATCH /api/vagas/[id]: pausar não mexe em nenhuma data
        // (não é encerramento definitivo); reabrir marca nova data_abertura e limpa
        // data_fechamento, igual reabertura manual.
        pedido.acao === "reabrir"
          ? { status: novoStatus, data_abertura: new Date().toISOString(), data_fechamento: null }
          : { status: novoStatus };

      const { error: erroUpdate } = await service.from("vagas").update(campos).eq("id", id);
      if (erroUpdate) {
        // Desfaz a decisão pra o pedido voltar a aparecer como pendente.
        await service.from("vaga_solicitacoes_status").update({ status: "pendente", decidido_por: null, decidido_em: null }).eq("id", pedido.id);
        return NextResponse.json({ error: "Erro ao atualizar a vaga: " + erroUpdate.message }, { status: 500 });
      }
      vagaAtualizada = true;

      if (pedido.acao === "reabrir") {
        await sincronizarPosicoesAbertas(id, service);
      }
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: decisao === "aprovada"
        ? (pedido.acao === "pausar" ? "vaga_pausa_aprovada" : "vaga_reativacao_aprovada")
        : (pedido.acao === "pausar" ? "vaga_pausa_recusada" : "vaga_reativacao_recusada"),
      entidade: "vagas",
      entidade_id: id,
      detalhes: {
        pedido_id: pedido.id,
        vaga_atualizada: vagaAtualizada,
        motivo: parsed.data.acao === "recusar" ? parsed.data.motivo : null,
      },
    });

    // E-mail pro contato do cliente — falha aqui não desfaz a decisão, só vai pro log.
    if (vaga.cliente_id) {
      const { data: cliente } = await service.from("clientes").select("contato_email").eq("id", vaga.cliente_id).maybeSingle();
      if (cliente?.contato_email) {
        const template = getEmailTemplate("vaga_status_decidido", {
          nome: "",
          cargo: vaga.titulo,
          nomeCliente: nomeClienteVaga ?? undefined,
          acaoSolicitada: pedido.acao,
          decisaoStatus: decisao,
          motivoRecusa: parsed.data.acao === "recusar" ? parsed.data.motivo : undefined,
        });
        const envio = await sendEmail({
          to: cliente.contato_email,
          subject: template.subject,
          html: template.html,
          tipo: "vaga_status_decidido",
          vaga_id: id,
        });
        if (!envio.success) {
          console.error(`[solicitacao-status] E-mail ao cliente não enviado (vaga_id=${id}):`, envio.error);
        }
      }
    }

    return NextResponse.json({ decisao, acao: pedido.acao, vaga_atualizada: vagaAtualizada });
  } catch (err) {
    console.error("[POST /api/vagas/[id]/solicitacao-status]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
