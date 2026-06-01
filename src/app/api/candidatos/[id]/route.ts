import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("candidatos")
    .update({
      nome_completo: body.nome_completo,
      telefone: body.telefone,
      email: body.email,
      cpf: body.cpf,
      cidade: body.cidade,
      estado: body.estado,
      cargo_pretendido: body.cargo_pretendido,
      tempo_experiencia: body.tempo_experiencia,
      turno_disponivel: body.turno_disponivel,
      pretensao_salarial: body.pretensao_salarial ?? null,
      idade: body.idade ?? null,
      formacao_academica: body.formacao_academica ?? null,
      resumo_profissional: body.resumo_profissional ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[PATCH /api/candidatos/[id]]", JSON.stringify(error));
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}
