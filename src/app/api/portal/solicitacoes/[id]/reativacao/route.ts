import { NextRequest, NextResponse } from "next/server";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, vagaSolicitarReativacaoSchema } from "@/lib/schemas";
import { clientePodeSolicitarReativacao } from "@/lib/vagaPausaReativacao";
import { notifyAllAnalysts } from "@/lib/notifyAllAnalysts";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Simétrico a encerramento/route.ts: cliente pede a reativação de uma vaga que está pausada
// (pedido do Olver, 26/09). Mesmo esqueleto, sem categorias de motivo (só "preciso da vaga
// de novo") — a Salmazos aprova ou recusa em POST /api/vagas/[id]/solicitacao-status.
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

    if (!clientePodeSolicitarReativacao(sol.status, vaga.status, !!pendenteExistente)) {
      return NextResponse.json(
        { error: "Não é possível pedir a reativação desta vaga agora. Fale com a equipe da Salmazos." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parseBody(vagaSolicitarReativacaoSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data: pedido, error } = await service
      .from("vaga_solicitacoes_status")
      .insert({
        vaga_id: vaga.id,
        unidade_id: vaga.unidade_id,
        acao: "reabrir",
        motivo_texto: parsed.data.motivo_texto || null,
        solicitado_por_user_id: user.id,
      })
      .select("id")
      .single();
    if (error || !pedido) {
      if (error?.code === "23505") {
        return NextResponse.json({ error: "Já existe um pedido aguardando decisão pra esta vaga." }, { status: 409 });
      }
      return NextResponse.json({ error: error?.message ?? "Erro ao registrar o pedido." }, { status: 500 });
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: user.email ?? null,
      acao: "vaga_reativacao_pedida",
      entidade: "vagas",
      entidade_id: vaga.id,
      detalhes: { cliente: sol.cliente_nome, pedido_id: pedido.id, motivo_texto: parsed.data.motivo_texto },
    });

    await service.from("notificacoes_analista").insert({
      tipo: "vaga_reativacao_pedida",
      titulo: `▶️ ${sol.cliente_nome ?? "Cliente"} pediu reativação da vaga`,
      mensagem: `${sol.cliente_nome ?? "O cliente"} pediu a reativação da vaga de ${sol.cargo} — aguardando aprovação.`,
      user_id: null,
      candidato_id: null,
      solicitacao_vaga_id: sol.id,
      unidade_id: vaga.unidade_id,
    });

    const template = getEmailTemplate("vaga_status_solicitado", {
      nome: "",
      cargo: sol.cargo,
      nomeCliente: sol.cliente_nome ?? undefined,
      acaoSolicitada: "reabrir",
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
    console.error("[POST /api/portal/solicitacoes/[id]/reativacao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
