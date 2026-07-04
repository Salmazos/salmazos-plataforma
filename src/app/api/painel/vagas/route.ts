import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularIndicadoresVaga } from "@/lib/indicadoresVaga";
import type { IndicadoresVaga, NivelAlerta } from "@/lib/indicadoresVaga";

const ORDEM_ALERTA: Record<NivelAlerta, number> = { vermelho: 0, amarelo: 1, verde: 2 };

export async function GET() {
  const supabase = createServiceClient();

  const { data: vagas, error } = await supabase
    .from("vagas")
    .select("id, titulo, slug, status, created_at, num_posicoes, clientes(nome)")
    .eq("status", "aberta");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!vagas || vagas.length === 0) return NextResponse.json({ data: [] });

  const vagaIds = vagas.map((v) => v.id);

  const { data: candidatosVagas, error: cvError } = await supabase
    .from("candidatos_vagas")
    .select("vaga_id, etapa, updated_at")
    .in("vaga_id", vagaIds);

  if (cvError) return NextResponse.json({ error: cvError.message }, { status: 500 });

  const porVaga = new Map<string, { etapa: string; updated_at: string }[]>();
  for (const cv of candidatosVagas ?? []) {
    const lista = porVaga.get(cv.vaga_id) ?? [];
    lista.push({ etapa: cv.etapa, updated_at: cv.updated_at });
    porVaga.set(cv.vaga_id, lista);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indicadores: IndicadoresVaga[] = (vagas as any[]).map((vaga) =>
    calcularIndicadoresVaga(
      {
        id: vaga.id,
        titulo: vaga.titulo,
        slug: vaga.slug ?? "",
        cliente_nome: vaga.clientes?.nome ?? null,
        status: vaga.status,
        created_at: vaga.created_at,
        num_posicoes: vaga.num_posicoes,
      },
      porVaga.get(vaga.id) ?? []
    )
  );

  indicadores.sort((a, b) => {
    const alertaDiff = ORDEM_ALERTA[a.nivel_alerta] - ORDEM_ALERTA[b.nivel_alerta];
    if (alertaDiff !== 0) return alertaDiff;
    if (a.dias_sem_movimento === null && b.dias_sem_movimento === null) return 0;
    if (a.dias_sem_movimento === null) return 1;
    if (b.dias_sem_movimento === null) return -1;
    return b.dias_sem_movimento - a.dias_sem_movimento;
  });

  return NextResponse.json({ data: indicadores });
}
