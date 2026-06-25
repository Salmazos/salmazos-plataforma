import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseBody, candidatoVagaCreateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const vagaId = request.nextUrl.searchParams.get("vaga_id");
  const candidatoId = request.nextUrl.searchParams.get("candidato_id");

  if (!vagaId && !candidatoId) {
    return NextResponse.json({ error: "vaga_id ou candidato_id obrigatório" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (candidatoId) {
    const { data, error } = await supabase
      .from("candidatos_vagas")
      .select("*, vagas(id, titulo, cidade, estado)")
      .eq("candidato_id", candidatoId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  const { data, error } = await supabase
    .from("candidatos_vagas")
    .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
    .eq("vaga_id", vagaId!)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(candidatoVagaCreateSchema, body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { vaga_id, candidato_id, etapa = null, responsavel = null } = parsed.data;
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

    const insertPayload: Record<string, unknown> = { vaga_id, candidato_id, etapa };
    if (responsavel) insertPayload.responsavel = responsavel;

    const { data, error } = await supabase
      .from("candidatos_vagas")
      .insert(insertPayload)
      .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (responsavel) {
      await supabase
        .from("candidatos")
        .update({ responsavel, updated_at: new Date().toISOString() })
        .eq("id", candidato_id);
    }

    // Sync: ensure an encaminhamento exists for this candidato+cliente if vaga has a cliente
    const { data: vaga } = await supabase
      .from("vagas")
      .select("cliente_id")
      .eq("id", vaga_id)
      .maybeSingle();

    if (vaga?.cliente_id) {
      try {
        await supabase
          .from("encaminhamentos")
          .upsert(
            { candidato_id, cliente_id: vaga.cliente_id, vaga_id, status: "aguardando" },
            { onConflict: "candidato_id,cliente_id", ignoreDuplicates: true }
          );
      } catch {
        // best-effort sync, non-blocking
      }
    }

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
