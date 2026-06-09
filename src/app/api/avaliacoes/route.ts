import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const candidatoId = request.nextUrl.searchParams.get("candidato_id");
  if (!candidatoId)
    return NextResponse.json(
      { error: "candidato_id é obrigatório" },
      { status: 400 }
    );

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("avaliacoes_psicologicas")
    .select(
      "id, tipo_teste, status, data_aplicacao, psicologo_responsavel, parecer_ia, comentarios_psicologo, pdf_url, created_at"
    )
    .eq("candidato_id", candidatoId)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { candidato_id, tipo_teste, data_aplicacao, psicologo_responsavel } =
    body;

  if (!candidato_id || !tipo_teste || !data_aplicacao)
    return NextResponse.json(
      { error: "candidato_id, tipo_teste e data_aplicacao são obrigatórios" },
      { status: 400 }
    );

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("avaliacoes_psicologicas")
    .insert({
      candidato_id,
      tipo_teste,
      data_aplicacao,
      psicologo_responsavel: psicologo_responsavel ?? null,
      status: "pendente",
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
