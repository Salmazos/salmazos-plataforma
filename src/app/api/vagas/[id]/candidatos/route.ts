import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ETAPAS_SAIDA_VAGA } from "@/lib/constants";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id: vagaId } = await params;
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("candidatos_vagas")
      .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
      .eq("vaga_id", vagaId)
      .not("etapa", "in", `(${ETAPAS_SAIDA_VAGA.join(",")})`)
      .order("match_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/vagas/[id]/candidatos]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
