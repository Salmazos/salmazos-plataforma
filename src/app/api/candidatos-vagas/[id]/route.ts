import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const campos: Record<string, unknown> = {};
    if (body.etapa !== undefined) campos.etapa = body.etapa;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("candidatos_vagas")
      .update(campos)
      .eq("id", id)
      .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const novaEtapa = body.etapa;
    const candidatoId = (data as { candidato_id: string }).candidato_id;

    if (novaEtapa === "aprovado") {
      await supabase
        .from("candidatos")
        .update({ etapa_kanban: "aprovado_cliente", status: "inativo" })
        .eq("id", candidatoId);

      return NextResponse.json({ data });
    }

    if (novaEtapa === "reprovado") {
      return NextResponse.json({
        data,
        showReprovacaoModal: true,
        candidatoId,
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/candidatos-vagas/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
