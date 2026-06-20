import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const ETAPAS_ATIVAS = ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"];

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("candidatos_vagas")
    .select("id, etapa, responsavel, vagas(titulo)")
    .eq("candidato_id", id)
    .in("etapa", ETAPAS_ATIVAS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const processos = (data ?? []).map((cv: Record<string, unknown>) => {
    const vagas = cv.vagas as { titulo: string } | null;
    return {
      vaga_titulo: vagas?.titulo ?? "—",
      responsavel: (cv.responsavel as string) ?? null,
      etapa: cv.etapa as string,
    };
  });

  return NextResponse.json({ ativo: processos.length > 0, processos });
}
