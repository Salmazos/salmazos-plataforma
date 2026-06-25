import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarHistorico } from "@/lib/registrarHistorico";
import { parseBody, feeStatusSchema } from "@/lib/schemas";

interface Params {
  params: Promise<{ id: string }>;
}

const LABELS: Record<string, string> = {
  pendente: "Pendente",
  cobrado: "Cobrado",
  recebido: "Recebido",
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = parseBody(feeStatusSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { fee_status } = parsed.data;

    const supabase = createServiceClient();

    const { data: cv, error } = await supabase
      .from("candidatos_vagas")
      .update({ fee_status })
      .eq("id", id)
      .select("candidato_id")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    void registrarHistorico({
      candidato_id: cv.candidato_id,
      tipo: "comentario_interno",
      descricao: `Fee R&S: status atualizado para ${LABELS[fee_status] ?? fee_status}`,
      metadata: { cv_id: id, fee_status },
    });

    return NextResponse.json({ success: true, fee_status });
  } catch (err) {
    console.error("[PATCH /api/candidatos-vagas/[id]/fee-status]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
