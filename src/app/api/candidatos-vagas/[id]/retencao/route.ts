import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularScoreRetencao } from "@/lib/calcularScoreRetencao";
import { registrarHistorico } from "@/lib/registrarHistorico";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: cv } = await supabase
    .from("candidatos_vagas")
    .select("id, candidato_id, vaga_id")
    .eq("id", id)
    .single();

  if (!cv) return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });

  try {
    const resultado = await calcularScoreRetencao(cv.candidato_id, cv.vaga_id);
    if (!resultado) {
      return NextResponse.json({ error: "Dados insuficientes para calcular" }, { status: 422 });
    }

    await supabase
      .from("candidatos_vagas")
      .update({
        retencao_score: resultado.score,
        retencao_label: resultado.label,
        retencao_resumo: resultado.resumo,
        retencao_calculado_em: new Date().toISOString(),
      })
      .eq("id", id);

    void registrarHistorico({
      candidato_id: cv.candidato_id,
      tipo: "retencao_ia",
      descricao: `Score de retenção calculado: ${resultado.score}/100 (${resultado.label})`,
      metadata: {
        score: resultado.score,
        label: resultado.label,
        resumo: resultado.resumo,
        fatores: resultado.fatores,
        vaga_id: cv.vaga_id,
        candidatos_vagas_id: id,
      },
    });

    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[POST /api/candidatos-vagas/[id]/retencao]", err);
    return NextResponse.json({ error: "Erro ao calcular score de retenção" }, { status: 500 });
  }
}
