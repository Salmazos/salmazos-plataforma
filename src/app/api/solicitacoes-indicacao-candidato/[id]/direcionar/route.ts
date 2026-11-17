import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { obterContextoUnidade, podeVerUnidade } from "@/lib/unidadeAuth";
import { parseBody, indicacaoDirecionarSchema } from "@/lib/schemas";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { ehErroSemVagaIndisponivel, MSG_SEM_VAGA_INDISPONIVEL, validarDirecionamento } from "@/lib/indicacaoSemVaga";

interface Params {
  params: Promise<{ id: string }>;
}

// "Direcionar para vaga existente": liga uma indicação SEM vaga a uma vaga aberta do mesmo cliente, tipo de serviço e unidade.
// Depois disso a indicação segue o fluxo normal (o analista aprova pela decisão de sempre: candidato, candidatura, encaminhamento,
// contratação e admissão). Aqui NADA disso é criado.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    const { ctx, erro } = await obterContextoUnidade(user);
    if (erro) return erro;

    const parsed = parseBody(indicacaoDirecionarSchema, await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const service = createServiceClient();
    const { data: sol } = await service.from("solicitacoes_indicacao_candidato").select("*").eq("id", id).maybeSingle();
    if (!sol || !podeVerUnidade(ctx, sol.unidade_id)) return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });

    const { data: vaga } = await service
      .from("vagas")
      .select("id, titulo, cliente_id, status, tipo_servico, unidade_id")
      .eq("id", parsed.data.vaga_id)
      .maybeSingle();
    const erroValidacao = validarDirecionamento(sol, vaga);
    if (erroValidacao) {
      const conflito = sol.status !== "pendente" || !!sol.vaga_id;
      return NextResponse.json({ error: erroValidacao }, { status: conflito ? 409 : 400 });
    }

    const usuarioNome = (await resolverNomeUsuario(user.id, user.email ?? null, service)) ?? "";
    const agora = new Date().toISOString();
    // Condicional: se outro analista direcionou/decidiu no meio, nada é gravado.
    const { data: direcionada, error } = await service
      .from("solicitacoes_indicacao_candidato")
      .update({ vaga_id: vaga!.id, direcionada_em: agora, direcionada_por: usuarioNome, direcionamento_tipo: "vaga_existente", updated_at: agora })
      .eq("id", id)
      .eq("status", "pendente")
      .is("vaga_id", null)
      .select("*, vagas(titulo, tipo_servico)")
      .maybeSingle();
    if (error) {
      if (ehErroSemVagaIndisponivel(error)) {
        console.error("[direcionar indicacao] Coluna nova ausente (migração pendente?):", error.code ?? "", error.message);
        return NextResponse.json({ error: MSG_SEM_VAGA_INDISPONIVEL }, { status: 503 });
      }
      console.error("[direcionar indicacao]", error.message);
      return NextResponse.json({ error: "Não foi possível direcionar a indicação." }, { status: 500 });
    }
    if (!direcionada) return NextResponse.json({ error: "A indicação mudou enquanto era direcionada. Recarregue e tente de novo." }, { status: 409 });

    registrarAuditoria({
      usuario_id: user.id,
      usuario_nome: usuarioNome,
      acao: "indicacao_candidato_direcionada",
      entidade: "solicitacoes_indicacao_candidato",
      entidade_id: id,
      detalhes: { cliente: sol.cliente_nome, vaga_id: vaga!.id, vaga_titulo: vaga!.titulo, direcionamento_tipo: "vaga_existente" },
    });

    return NextResponse.json({ data: direcionada });
  } catch (err) {
    console.error("[POST /api/solicitacoes-indicacao-candidato/[id]/direcionar]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
