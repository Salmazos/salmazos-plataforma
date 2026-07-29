import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";

interface Params {
  params: Promise<{ contratoId: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { contratoId } = await params;

  const svc = createServiceClient();
  const { data: contrato } = await svc
    .from("funcionario_contratos")
    .select("arquivo_path")
    .eq("id", contratoId)
    .maybeSingle();

  if (!contrato?.arquivo_path) {
    return NextResponse.json({ error: "Contrato não encontrado ou sem arquivo." }, { status: 404 });
  }

  const { data, error } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(contrato.arquivo_path, 60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
