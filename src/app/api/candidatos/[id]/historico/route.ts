import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const tipos = request.nextUrl.searchParams.get("tipos");

    const supabase = createServiceClient();

    let query = supabase
      .from("historico_candidato")
      .select("tipo, descricao, created_at")
      .eq("candidato_id", id)
      .order("created_at", { ascending: false });

    if (tipos) {
      query = query.in("tipo", tipos.split(","));
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/candidatos/[id]/historico]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
