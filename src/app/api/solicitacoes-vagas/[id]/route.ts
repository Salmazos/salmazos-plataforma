import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, solicitacaoVagaUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { mensagemDecisaoSolicitacao } from "@/lib/solicitacaoVagaStatus";
import { aplicarAlteracoesSolicitacao, calcularAlteracoes } from "@/lib/solicitacaoAlteracao";

interface Params {
  params: Promise<{ id: string }>;
}

// Busca uma solicitação específica independente do status — usado pelo deep-link
// da notificação "nova_solicitacao_vaga" (que pode apontar pra uma solicitação já
// aprovada/recusada por outra pessoa desde que a notificação foi criada).
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const service = createServiceClient();
  const { data, error } = await service
    .from("solicitacoes_vagas")
    .select("*")
    .eq("id", id)
    .single();

  // Solicitação de outra unidade responde igual a inexistente.
  if (error || !data || !podeVerUnidade(ctx, data.unidade_id)) {
    return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }

  const { data: pedido } = await service
    .from("solicitacao_vaga_alteracoes")
    .select("id, solicitacao_vaga_id, alteracoes, criado_em")
    .eq("solicitacao_vaga_id", id)
    .eq("status", "pendente")
    .maybeSingle();

  // Pedido de pausa/reabertura (ver vagaPausaReativacao.ts) é indexado por vaga_id, não
  // pelo id da solicitação.
  let pedidoStatus = null;
  if (data.vaga_id) {
    const { data: ps } = await service
      .from("vaga_solicitacoes_status")
      .select("id, vaga_id, acao, motivo_tipo, motivo_texto, criado_em")
      .eq("vaga_id", data.vaga_id)
      .eq("status", "pendente")
      .maybeSingle();
    pedidoStatus = ps;
  }

  return NextResponse.json({ data: { ...data, alteracao_pendente: pedido ?? null, status_pendente: pedidoStatus ?? null } });
}

// Ajustes da equipe numa solicitação do portal, sem precisar pedir pro cliente reenviar
// (pedido do Olver, 25/09). Pendente: muda só a solicitação. Aprovada: muda a solicitação e
// propaga os campos alterados pra vaga criada a partir dela (e com isso pra página pública).
// Recusada não se edita. O cliente passa a ver a versão editada no portal; o que ele pediu
// originalmente fica registrado na auditoria (antes/depois de cada campo alterado).
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const body = await request.json();
    const parsed = parseBody(solicitacaoVagaUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: atual } = await service.from("solicitacoes_vagas").select("*").eq("id", id).single();

    if (!atual || !podeVerUnidade(ctx, atual.unidade_id)) {
      return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    }
    if (atual.status !== "pendente" && atual.status !== "aprovada") {
      return NextResponse.json({ error: mensagemDecisaoSolicitacao(atual) }, { status: 409 });
    }

    const alteracoes = calcularAlteracoes(atual, parsed.data);
    if (Object.keys(alteracoes).length === 0) return NextResponse.json({ data: atual });

    const usuarioNome = (await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? "";

    // Status lido acima vai junto: se alguém aprovou/recusou no meio da edição, não grava.
    const { data, vagaAtualizada, erroVaga } = await aplicarAlteracoesSolicitacao(atual, alteracoes, usuarioNome, service);
    if (!data) {
      return NextResponse.json({ error: "A solicitação mudou de status enquanto era editada." }, { status: 409 });
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "solicitacao_vaga_editada",
      entidade: "solicitacoes_vagas",
      entidade_id: id,
      detalhes: {
        cliente: atual.cliente_nome,
        status: atual.status,
        vaga_atualizada: vagaAtualizada ? atual.vaga_id : null,
        alteracoes,
      },
    });

    if (erroVaga) {
      return NextResponse.json(
        { data, error: "A solicitação foi salva, mas não foi possível atualizar a vaga. Ajuste a vaga pela tela de Vagas." },
        { status: 500 }
      );
    }
    return NextResponse.json({ data, vaga_atualizada: vagaAtualizada });
  } catch (err) {
    console.error("[PATCH /api/solicitacoes-vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
