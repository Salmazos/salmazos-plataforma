import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();
  const { data: rescisao } = await svc
    .from("rescisoes")
    .select("aso_documento_path")
    .eq("id", id)
    .maybeSingle();

  if (!rescisao?.aso_documento_path) {
    return NextResponse.json({ error: "Esta rescisão não tem ASO anexado." }, { status: 404 });
  }

  const { data, error } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(rescisao.aso_documento_path, 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
