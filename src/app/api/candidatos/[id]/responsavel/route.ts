import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { responsavel } = body;

  const svc = createServiceClient();

  if (responsavel !== "") {
    const { data: analista } = await svc
      .from("analistas_perfil")
      .select("id")
      .eq("nome_completo", responsavel)
      .eq("ativo", true)
      .maybeSingle();

    if (!analista) {
      return NextResponse.json({ error: "Responsável inválido." }, { status: 400 });
    }
  }

  const { data, error } = await svc
    .from("candidatos")
    .update({ responsavel: responsavel || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
