import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const STATUS_VALIDOS = ["aguardando", "aprovado", "reprovado", "desistiu"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.status && !STATUS_VALIDOS.includes(body.status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }

    const campos: Record<string, unknown> = {};
    if (body.status !== undefined) campos.status = body.status;
    if (body.observacoes !== undefined) campos.observacoes = body.observacoes;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("encaminhamentos")
      .update(campos)
      .eq("id", id)
      .select("*, cliente:clientes(id, nome, cidade, segmento, servicos)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/encaminhamentos/[id]]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
