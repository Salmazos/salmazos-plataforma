import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: candidato, error: fetchErr } = await supabase
      .from("candidatos")
      .select("id, alocacao_cliente_nome, alocacao_vaga_titulo")
      .eq("id", id)
      .single();

    if (fetchErr || !candidato)
      return NextResponse.json({ error: "Candidato não encontrado." }, { status: 404 });

    const clienteNome = candidato.alocacao_cliente_nome ?? "—";
    const vagaTitulo = candidato.alocacao_vaga_titulo ?? "—";

    const { error } = await supabase
      .from("candidatos")
      .update({
        status_alocacao: "disponivel",
        alocacao_cliente_nome: null,
        alocacao_vaga_titulo: null,
        alocacao_data_inicio: null,
        alocacao_data_fim: null,
        alocacao_tipo_servico: null,
        alocacao_renovavel: false,
      })
      .eq("id", id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    void registrarHistorico({
      candidato_id: id,
      tipo: "etapa_alterada",
      descricao: `Alocação encerrada em ${clienteNome} — ${vagaTitulo}. Candidato disponível novamente.`,
      metadata: { cliente: clienteNome, vaga: vagaTitulo },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/candidatos/[id]/encerrar-alocacao]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
