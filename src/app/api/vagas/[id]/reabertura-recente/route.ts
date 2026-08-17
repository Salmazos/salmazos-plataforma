import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { buscarContratacaoAnteriorRecente } from "@/lib/cobrancaRS";

interface Params {
  params: Promise<{ id: string }>;
}

const DIAS_GARANTIA = 30;

// Contexto de reabertura pra decisão de cobrança R&S dentro do modal de finalizar
// contratação (ver ModalFinalizarProcesso) — chamado ANTES de confirmar, pra avisar o
// analista se essa vaga já teve uma contratação recente (< 30 dias), seja por vínculo
// explícito de garantia (vagas.reposicao_de_candidato_vaga_id, fluxo de
// acionar-garantia) ou por reabertura manual da mesma vaga (detectado pelo histórico).
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: vaga, error } = await supabase
    .from("vagas")
    .select("tipo_servico, reposicao_de_candidato_vaga_id")
    .eq("id", id)
    .single();

  if (error || !vaga) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });

  if (vaga.tipo_servico !== "recrutamento_selecao") {
    return NextResponse.json({ reaberturaRecente: false });
  }

  if (vaga.reposicao_de_candidato_vaga_id) {
    const { data: cvOriginal } = await supabase
      .from("candidatos_vagas")
      .select("data_inicio, candidatos(nome_completo)")
      .eq("id", vaga.reposicao_de_candidato_vaga_id)
      .maybeSingle();
    const cvo = cvOriginal as { data_inicio: string | null; candidatos: { nome_completo: string } | null } | null;
    return NextResponse.json({
      reaberturaRecente: true,
      candidatoNome: cvo?.candidatos?.nome_completo ?? null,
      dataInicioAnterior: cvo?.data_inicio ?? null,
    });
  }

  const anterior = await buscarContratacaoAnteriorRecente(id, supabase);
  if (!anterior) return NextResponse.json({ reaberturaRecente: false });

  const diffDias = Math.floor(
    (Date.now() - new Date(anterior.dataInicio + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDias >= DIAS_GARANTIA) return NextResponse.json({ reaberturaRecente: false });

  return NextResponse.json({
    reaberturaRecente: true,
    candidatoNome: anterior.candidatoNome,
    dataInicioAnterior: anterior.dataInicio,
  });
}
