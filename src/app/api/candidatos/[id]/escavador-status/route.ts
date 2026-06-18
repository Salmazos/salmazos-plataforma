import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

function labelForScore(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bom";
  if (score >= 40) return "Regular";
  return "Baixo";
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const newStatus = body.escavador_status as string;

  if (newStatus !== "limpo" && newStatus !== "consta") {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: candidato } = await svc
    .from("candidatos")
    .select("triagem_score, triagem_label, triagem_resumo, juridico_tem_trabalhista, escavador_status")
    .eq("id", id)
    .single();

  if (!candidato) {
    return NextResponse.json({ error: "Candidato não encontrado" }, { status: 404 });
  }

  const oldStatus = candidato.escavador_status as string | null;
  const triagem = candidato.triagem_score as number | null;
  const datajudPenalized = candidato.juridico_tem_trabalhista as boolean | null;
  let newScore = triagem;
  let newLabel = candidato.triagem_label as string | null;
  let newResumo = candidato.triagem_resumo as string | null;

  if (newStatus === "consta" && oldStatus !== "consta" && triagem != null) {
    if (!datajudPenalized) {
      newScore = Math.max(0, triagem - 20);
      newLabel = labelForScore(newScore);
      const suffix = " | Score penalizado por consulta jurídica (Escavador)";
      if (!newResumo?.includes(suffix)) {
        newResumo = (newResumo ?? "") + suffix;
      }
    }
  }

  if (newStatus === "limpo" && oldStatus === "consta" && newScore != null) {
    if (!datajudPenalized) {
      newScore = Math.min(100, newScore + 20);
      newLabel = labelForScore(newScore);
      const suffix = " | Score penalizado por consulta jurídica (Escavador)";
      if (newResumo?.includes(suffix)) {
        newResumo = newResumo.replace(suffix, "");
      }
    }
  }

  await svc
    .from("candidatos")
    .update({
      escavador_status: newStatus,
      triagem_score: newScore,
      triagem_label: newLabel,
      triagem_resumo: newResumo,
    })
    .eq("id", id);

  return NextResponse.json({
    triagem_score: newScore,
    triagem_label: newLabel,
    triagem_resumo: newResumo,
    escavador_status: newStatus,
  });
}
