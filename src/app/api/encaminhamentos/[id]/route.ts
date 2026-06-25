import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, encaminhamentoUpdateSchema } from "@/lib/schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = parseBody(encaminhamentoUpdateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const campos: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) campos.status = parsed.data.status;
    if (parsed.data.observacoes !== undefined) campos.observacoes = parsed.data.observacoes;

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
