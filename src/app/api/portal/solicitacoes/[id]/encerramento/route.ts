import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, vagaSolicitarPausaSchema } from "@/lib/schemas";
import { clientePodeSolicitarPausa, ROTULO_MOTIVO_ENCERRAMENTO } from "@/lib/vagaPausaReativacao";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Cliente pede, pelo portal, pra encerrar (pausar) uma vaga já aprovada e aberta (pedido do
// Olver, 26/09). Não some na hora: vira um pedido pendente em vaga_solicitacoes_status, que
// a Salmazos aprova ou recusa (POST /api/vagas/[id]/solicitacao-status) — mesmo esqueleto do
// pedido de alteração de solicitação. Resultado da aprovação é sempre status 'pausada' na
// vaga, nunca 'fechada'/'cancelada' — essa distinção fica pra decisão manual do analista.
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
      .select("id, status, vaga_id, cargo, cliente_nome, unidade_id")
      .eq("id", id)
      .eq("cliente_id", cu.cliente_id)
      .maybeSingle();
    if (!sol || !sol.vaga_id) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });

    const { data: vaga } = await service
      .from("vagas")
      .select("id, status, unidade_id")
      .eq("id", sol.vaga_id)
      .maybeSingle();
    if (!vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });

    const { data: pendenteExistente } = await service
      .from("vaga_solicitacoes_status")
      .select("id")
      .eq("vaga_id", vaga.id)
      .eq("status", "pendente")
      .maybeSingle();

    if (!clientePodeSolicitarPausa(sol.status, vaga.status, !!pendenteExistente)) {
      return NextResponse.json(
        { error: "Não é possível pedir o encerramento desta vaga agora. Fale com a equipe da Salmazos." },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = parseBody(vagaSolicitarPausaSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data: pedido, error } = await service
      .from("vaga_solicitacoes_status")
      .insert({
        vaga_id: vaga.id,
        unidade_id: vaga.unidade_id,
        acao: "pausar",
        motivo_tipo: parsed.data.motivo_tipo,
        motivo_texto: parsed.data.motivo_texto || null,
        solicitado_por_user_id: user.id,
      })
      .select("id")
      .single();
    if (error || !pedido) {
      // Índice único garante 1 pendente por vaga — corrida rara (2 abas) cai aqui.
      if (error?.code === "23505") {
        return NextResponse.json({ error: "Já existe um pedido aguardando decisão pra esta vaga." }, { status: 409 });
      }
      return NextResponse.json({ error: error?.message ?? "Erro ao registrar o pedido." }, { status: 500 });
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: user.email ?? null,
      acao: "vaga_pausa_pedida",
      entidade: "vagas",
      entidade_id: vaga.id,
      detalhes: { cliente: sol.cliente_nome, pedido_id: pedido.id, motivo_tipo: parsed.data.motivo_tipo, motivo_texto: parsed.data.motivo_texto },
    });

    await service.from("notificacoes_analista").insert({
      tipo: "vaga_pausa_pedida",
      titulo: `⏸️ ${sol.cliente_nome ?? "Cliente"} pediu encerramento da vaga`,
      mensagem: `${sol.cliente_nome ?? "O cliente"} pediu o encerramento da vaga de ${sol.cargo} — aguardando aprovação.`,
      user_id: null,
      candidato_id: null,
      solicitacao_vaga_id: sol.id,
      unidade_id: vaga.unidade_id,
    });

    const template = getEmailTemplate("vaga_status_solicitado", {
      nome: "",
      cargo: sol.cargo,
      nomeCliente: sol.cliente_nome ?? undefined,
      acaoSolicitada: "pausar",
      motivoTipoEncerramentoLabel: ROTULO_MOTIVO_ENCERRAMENTO[parsed.data.motivo_tipo],
      motivoTextoEncerramento: parsed.data.motivo_texto || null,
      solicitacaoUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/painel/vagas?solicitacao=${sol.id}`,
    });
    await notifyAllAnalysts({
      subject: template.subject,
      html: template.html,
      tipo: "vaga_status_solicitado",
      unidadeId: vaga.unidade_id,
    });

    return NextResponse.json({ ok: true, pedido_id: pedido.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/portal/solicitacoes/[id]/encerramento]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
