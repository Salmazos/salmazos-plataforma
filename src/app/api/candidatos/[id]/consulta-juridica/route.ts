import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { consultarProcessos } from "@/lib/consultaJuridica";

interface Params {
  params: Promise<{ id: string }>;
}

function labelForScore(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bom";
  if (score >= 40) return "Regular";
  return "Baixo";
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: candidato } = await svc
    .from("candidatos")
    .select("nome_completo, cidade, triagem_score")
    .eq("id", id)
    .single();

  if (!candidato) {
    return NextResponse.json({ error: "Candidato não encontrado" }, { status: 404 });
  }

  const resultado = await consultarProcessos(
    candidato.nome_completo as string,
    (candidato.cidade as string | null) ?? undefined
  );

  const updatePayload: Record<string, unknown> = {
    juridico_consultado_em: new Date().toISOString(),
    juridico_tem_trabalhista: resultado.temTrabalhista,
    juridico_total_processos: resultado.totalProcessos,
    juridico_resumo: resultado.resumo,
  };

  if (resultado.temTrabalhista && candidato.triagem_score != null) {
    const newScore = Math.max(0, (candidato.triagem_score as number) - 20);
    updatePayload.triagem_score = newScore;
    updatePayload.triagem_label = labelForScore(newScore);
  }

  await svc.from("candidatos").update(updatePayload).eq("id", id);

  return NextResponse.json({
    temTrabalhista: resultado.temTrabalhista,
    totalProcessos: resultado.totalProcessos,
    resumo: resultado.resumo,
  });
}
