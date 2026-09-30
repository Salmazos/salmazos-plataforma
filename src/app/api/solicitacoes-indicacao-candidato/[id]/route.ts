import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, indicacaoCandidatoEditSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string }>;
}

// Busca uma indicação específica — usado pelo deep-link da notificação "nova_indicacao_candidato".
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { ctx, erro } = await obterContextoUnidade(user);
  if (erro) return erro;

  const service = createServiceClient();
  const { data, error } = await service
    .from("solicitacoes_indicacao_candidato")
    .select("*, vagas(titulo, tipo_servico)")
    .eq("id", id)
    .single();

  if (error || !data || !podeVerUnidade(ctx, data.unidade_id)) {
    return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ data });
}

// Ajuste do analista nos dados que o cliente mandou, antes de aprovar (mesmo padrão de
// PATCH /api/solicitacoes-vagas/[id]) — só permitido enquanto pendente.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const body = await request.json();
    const parsed = parseBody(indicacaoCandidatoEditSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: atual } = await service
      .from("solicitacoes_indicacao_candidato")
      .select("*")
      .eq("id", id)
      .single();

    if (!atual || !podeVerUnidade(ctx, atual.unidade_id)) {
      return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
    }
    if (atual.status !== "pendente") {
      return NextResponse.json({ error: "Esta indicação já foi decidida." }, { status: 409 });
    }

    // Vaga é revalidada só se o analista trocou (precisa continuar sendo do mesmo cliente).
    if (parsed.data.vaga_id && parsed.data.vaga_id !== atual.vaga_id) {
      const { data: vaga } = await service
        .from("vagas")
        .select("id")
        .eq("id", parsed.data.vaga_id)
        .eq("cliente_id", atual.cliente_id)
        .maybeSingle();
      if (!vaga) return NextResponse.json({ error: "Vaga inválida para este cliente." }, { status: 400 });
    }

    const { data, error } = await service
      .from("solicitacoes_indicacao_candidato")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pendente")
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "A indicação mudou de status enquanto era editada." }, { status: 409 });
    }

    const usuarioNome = (await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? "";
    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "indicacao_candidato_editada",
      entidade: "solicitacoes_indicacao_candidato",
      entidade_id: id,
      detalhes: { cliente: atual.cliente_nome, alteracoes: parsed.data },
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/solicitacoes-indicacao-candidato/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
