import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcularTriagem } from "@/lib/triagemAutomatica";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    await calcularTriagem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[triagem route]", err);
    return NextResponse.json({ error: "Erro ao calcular triagem." }, { status: 500 });
  }
}
