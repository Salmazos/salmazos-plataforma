import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { nomesCompletosDaUnidade } from "@/lib/responsaveis";
import { parseBody, candidatoVagaCreateSchema } from "@/lib/schemas";
import { exigirAcessoCandidatoVaga, exigirAcessoVaga, exigirContextoUnidade } from "@/lib/unidadeAuth";

export async function GET(request: NextRequest) {
  const vagaId = request.nextUrl.searchParams.get("vaga_id");
  const candidatoId = request.nextUrl.searchParams.get("candidato_id");

  if (!vagaId && !candidatoId) {
    return NextResponse.json({ error: "vaga_id ou candidato_id obrigatório" }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (candidatoId) {
    const { ctx, erro } = await exigirContextoUnidade();
    if (erro) return erro;

    // Candidato é compartilhado entre unidades, mas as candidaturas dele que aparecem são só
    // as de vagas da unidade de quem consulta (!inner pra o filtro na vaga valer).
    let query = supabase
      .from("candidatos_vagas")
      .select("*, vagas!candidatos_vagas_vaga_id_fkey!inner(id, titulo, cidade, estado)")
      .eq("candidato_id", candidatoId)
      .order("created_at", { ascending: false });
    if (!ctx.todasUnidades) query = query.eq("vagas.unidade_id", ctx.unidadeId);
    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  const bloqueio = await exigirAcessoVaga(vagaId!);
  if (bloqueio) return bloqueio;

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
    const { vaga_id, candidato_id, etapa = null } = parsed.data;
    let responsavel = parsed.data.responsavel ?? null;
    const bloqueio = await exigirAcessoVaga(vaga_id);
    if (bloqueio) return bloqueio;
    const supabase = createServiceClient();

    const { data: vagaStatus } = await supabase
      .from("vagas")
      .select("status, unidades(slug)")
      .eq("id", vaga_id)
      .single();

    // Sem responsável informado (ex: "Adicionar candidato" na tela da vaga), quem está logado
    // assume — se for do time da unidade da vaga (decisão do Olver, 25/09). Fora do time, não
    // mexe no responsável atual do candidato.
    if (!responsavel) {
      const { data: { user } } = await (await createClient()).auth.getUser();
      if (user) {
        const { data: perfil } = await supabase.from("analistas_perfil").select("nome_completo").eq("user_id", user.id).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const slug = (vagaStatus?.unidades as any)?.slug ?? null;
        if (perfil?.nome_completo && nomesCompletosDaUnidade(slug).includes(perfil.nome_completo)) {
          responsavel = perfil.nome_completo;
        }
      }
    }

    if (vagaStatus?.status === "pausada") {
      return NextResponse.json(
        { error: "Esta vaga está pausada e não aceita novos candidatos no momento." },
        { status: 409 }
      );
    }

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
    const bloqueio = await exigirAcessoCandidatoVaga(id);
    if (bloqueio) return bloqueio;
    const supabase = createServiceClient();
    const { error } = await supabase.from("candidatos_vagas").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/candidatos-vagas]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
