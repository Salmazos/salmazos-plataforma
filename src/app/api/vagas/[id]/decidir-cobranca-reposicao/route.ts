import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria, resolverNomeUsuario } from "@/lib/audit";
import { gerarCobrancasRSParaVaga, decisaoCobrancaJaRegistrada } from "@/lib/cobrancaRS";

interface Params {
  params: Promise<{ id: string }>;
}

// Decisão do analista sobre gerar (ou não) cobrança R&S numa vaga R&S que já fechou
// sozinha (fechamento automático — última posição preenchida em finalizar/route.ts, que
// pula gerarCobrancasRSParaVaga em toda vaga R&S e deixa "pendente de decisão"). Diferente
// do PATCH /api/vagas/[id]: esse endpoint não muda status (já está "fechada"), só resolve a
// pendência financeira — por isso não dá pra reusar a checagem "status mudou" de lá, que é
// o gatilho de quando aquele endpoint pede a decisão.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (typeof body.gerar_cobranca !== "boolean") {
      return NextResponse.json({ error: "gerar_cobranca (true ou false) é obrigatório." }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: vaga, error } = await supabase
      .from("vagas")
      .select("id, status, tipo_servico, data_abertura, reposicao_de_candidato_vaga_id")
      .eq("id", id)
      .single();

    if (error || !vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
    if (vaga.tipo_servico !== "recrutamento_selecao") {
      return NextResponse.json({ error: "Esta vaga não é de Recrutamento e Seleção." }, { status: 400 });
    }
    if (vaga.status !== "fechada") {
      return NextResponse.json({ error: "Esta vaga ainda não está fechada." }, { status: 400 });
    }

    // Escopado ao ciclo atual (desde a última data_abertura) — a mesma vaga pode reabrir e
    // fechar de novo, e cada fechamento precisa da sua própria decisão (ver
    // decisaoCobrancaJaRegistrada).
    const decisaoExistente = await decisaoCobrancaJaRegistrada(id, vaga.data_abertura as string | null, supabase);
    if (decisaoExistente) {
      return NextResponse.json({ error: "Decisão já registrada para esta vaga." }, { status: 409 });
    }

    let usuarioId: string | null = null;
    let usuarioNome: string | null = null;
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      usuarioId = user.id;
      usuarioNome = await resolverNomeUsuario(user.id, user.email ?? null, supabase);
    }

    registrarAuditoria({
      usuario_id: usuarioId,
      usuario_nome: usuarioNome,
      acao: "cobranca_rs_reposicao_decisao",
      entidade: "vagas",
      entidade_id: id,
      detalhes: {
        reposicao_de_candidato_vaga_id: vaga.reposicao_de_candidato_vaga_id,
        gerar_cobranca: body.gerar_cobranca === true,
        origem: "fechamento_automatico_finalizar",
      },
    });

    if (body.gerar_cobranca === true) {
      await gerarCobrancasRSParaVaga(id, supabase).catch((err) =>
        console.error("[decidir-cobranca-reposicao] Erro ao gerar cobranças R&S:", err)
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/vagas/[id]/decidir-cobranca-reposicao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
