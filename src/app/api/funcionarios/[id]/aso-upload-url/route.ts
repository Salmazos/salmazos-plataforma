import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Mesmo padrão do ASO demissional (rescisoes-aso): bucket privado "admissao-docs"
// reaproveitado, pasta própria por categoria — asos-periodicos/ aqui, sem cruzar com
// rescisoes-aso/. Signed upload URL: o cliente envia o arquivo direto pro Storage.
const BUCKET = "admissao-docs";

export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const { id: funcionarioId } = await params;
  const body = await request.json().catch(() => ({}));
  const nomeArquivo = typeof body.nome_arquivo === "string" ? body.nome_arquivo : "aso";

  const safeFilename = nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `asos-periodicos/${funcionarioId}/aso-${Date.now()}-${safeFilename}`;

  const svc = createServiceClient();
  const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, token: data.token });
}
