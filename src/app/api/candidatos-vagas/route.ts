import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const vagaId = request.nextUrl.searchParams.get("vaga_id");
  if (!vagaId) return NextResponse.json({ error: "vaga_id obrigatório" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("candidatos_vagas")
    .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
    .eq("vaga_id", vagaId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const { vaga_id, candidato_id } = await request.json();
    if (!vaga_id || !candidato_id) {
      return NextResponse.json({ error: "vaga_id e candidato_id são obrigatórios." }, { status: 400 });
    }
    const supabase = createServiceClient();

    const { data: existente } = await supabase
      .from("candidatos_vagas")
      .select("id")
      .eq("vaga_id", vaga_id)
      .eq("candidato_id", candidato_id)
      .maybeSingle();

    if (existente) {
      return NextResponse.json(
        { error: "Candidato já vinculado a esta vaga." },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("candidatos_vagas")
      .insert({ vaga_id, candidato_id })
      .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/candidatos-vagas]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    const supabase = createServiceClient();
    const { error } = await supabase.from("candidatos_vagas").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/candidatos-vagas]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
