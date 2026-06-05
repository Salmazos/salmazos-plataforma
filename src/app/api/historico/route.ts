import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const candidato_id = request.nextUrl.searchParams.get("candidato_id");
  if (!candidato_id) {
    return NextResponse.json({ error: "candidato_id é obrigatório." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("historico_candidato")
    .select("id, tipo, descricao, metadata, criado_por, created_at")
    .eq("candidato_id", candidato_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json();
  const { candidato_id, descricao } = body as { candidato_id?: string; descricao?: string };

  if (!candidato_id || !descricao?.trim()) {
    return NextResponse.json(
      { error: "candidato_id e descricao são obrigatórios." },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("historico_candidato")
    .insert({
      candidato_id,
      tipo: "comentario_interno",
      descricao: descricao.trim(),
      criado_por: user.email ?? null,
    })
    .select("id, tipo, descricao, metadata, criado_por, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
