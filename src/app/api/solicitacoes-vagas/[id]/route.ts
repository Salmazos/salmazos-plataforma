import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, solicitacaoVagaUpdateSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { mensagemDecisaoSolicitacao } from "@/lib/solicitacaoVagaStatus";

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
  return NextResponse.json({ data });
}

// Linhas "• Item" do texto de benefícios viram os chips que o card mostra — mesmo formato que
// o portal grava (texto em tópicos + chips), pra os dois não ficarem divergentes depois da edição.
function chipsDeBeneficios(texto: string | null): Record<string, boolean> | null {
  if (!texto) return null;
  const itens = texto
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
  if (itens.length === 0) return null;
  return Object.fromEntries(itens.map((i) => [i, true]));
}

// Ajustes pequenos da equipe numa solicitação do portal antes de aprovar, sem precisar pedir
// pro cliente reenviar (pedido do Olver, 25/09). Só enquanto está pendente — depois de aprovada,
// quem se edita é a vaga. O cliente passa a ver a versão editada no portal; o que ele pediu
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
    if (atual.status !== "pendente") {
      return NextResponse.json({ error: mensagemDecisaoSolicitacao(atual) }, { status: 409 });
    }

    const campos: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(parsed.data)) {
      if (valor === undefined) continue;
      const normalizado = typeof valor === "string" && campo !== "cargo" && campo !== "cidade" ? valor.trim() || null : valor;
      if (normalizado !== atual[campo]) campos[campo] = normalizado;
    }
    if ("beneficios" in campos) campos.beneficios_chips = chipsDeBeneficios(campos.beneficios as string | null);

    if (Object.keys(campos).length === 0) return NextResponse.json({ data: atual });

    const { data, error } = await service
      .from("solicitacoes_vagas")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pendente")
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "A solicitação mudou de status enquanto era editada." }, { status: 409 });
    }

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: await resolverNomeUsuario(user.id, user.email ?? null, service),
      acao: "solicitacao_vaga_editada",
      entidade: "solicitacoes_vagas",
      entidade_id: id,
      detalhes: {
        cliente: atual.cliente_nome,
        alteracoes: Object.fromEntries(
          Object.keys(campos).map((campo) => [campo, { antes: atual[campo] ?? null, depois: campos[campo] ?? null }])
        ),
      },
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/solicitacoes-vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
