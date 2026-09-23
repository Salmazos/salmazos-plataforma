import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exigirContextoUnidade } from "@/lib/unidadeAuth";

const ETAPAS_ATIVAS = ["triagem", "entrevista_salmazos", "entrevista_cliente", "aprovado_cliente"];

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { ctx, erro } = await exigirContextoUnidade();
  if (erro) return erro;
  const supabase = createServiceClient();

  // Candidato é compartilhado, mas só entram os processos em vagas da unidade de quem
  // consulta (!inner pra o filtro na vaga valer).
  let query = supabase
    .from("candidatos_vagas")
    .select("id, etapa, responsavel, vagas!candidatos_vagas_vaga_id_fkey!inner(titulo)")
    .eq("candidato_id", id)
    .in("etapa", ETAPAS_ATIVAS);
  if (!ctx.todasUnidades) query = query.eq("vagas.unidade_id", ctx.unidadeId);
  const { data, error } = await query;

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
