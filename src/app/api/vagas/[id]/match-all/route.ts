import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularMatch } from "@/lib/matchCalculation";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id: vagaId } = await params;
    const supabase = createServiceClient();

    const { data: cvs } = await supabase
      .from("candidatos_vagas")
      .select("id, candidato_id")
      .eq("vaga_id", vagaId);

    if (!cvs?.length) return NextResponse.json({ results: [] });

    const results: Array<{
      candidato_id: string;
      cv_id: string;
      score: number;
      detalhes: object;
    }> = [];

    for (const cv of cvs) {
      try {
        const resultado = await calcularMatch(vagaId, cv.candidato_id);
        if (resultado) {
          results.push({ candidato_id: cv.candidato_id, cv_id: cv.id, ...resultado });
        }
      } catch {
        // skip if one candidate fails
      }
    }

    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[POST /api/vagas/[id]/match-all]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
