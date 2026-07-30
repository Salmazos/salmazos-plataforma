import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ id: string }>;
}

const GENEROS_PERMITIDOS = ["Masculino", "Feminino"];

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const genero = body.genero as string;

  // Restrito a Masculino/Feminino de propósito — essa rota existe só para o
  // preenchimento em massa no Banco de Candidatos; as outras opções do enum
  // (Outro, Prefiro não informar) continuam só nos formulários de cadastro.
  if (!GENEROS_PERMITIDOS.includes(genero)) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("candidatos")
    .update({ genero })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ genero });
}
