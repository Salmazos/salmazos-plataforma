import { NextRequest, NextResponse } from "next/server";
import { calcularMatch } from "@/lib/matchCalculation";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: vagaId } = await params;
    const { candidato_id } = await request.json();

    if (!candidato_id)
      return NextResponse.json({ error: "candidato_id obrigatório." }, { status: 400 });

    const resultado = await calcularMatch(vagaId, candidato_id);

    if (!resultado)
      return NextResponse.json(
        { error: "Candidato não vinculado a esta vaga ou não encontrado." },
        { status: 404 }
      );

    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[POST /api/vagas/[id]/match]", err);
    return NextResponse.json({ error: "Erro ao calcular match." }, { status: 500 });
  }
}
