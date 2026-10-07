import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";
import { checarAcessoFuncionarioRH } from "@/lib/rhUnidadeAuth";

interface Params {
  params: Promise<{ id: string }>;
}

// Aditivo de prorrogação: mesmo bucket privado "admissao-docs", pasta PRÓPRIA (aditivos/). Nunca contratos/ —
// a ficha usa funcionario_contratos[0] como "contrato atual", e um aditivo ali viraria o contrato atual.
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
  const bloqueioUnidade = await checarAcessoFuncionarioRH(user, funcionarioId);
  if (bloqueioUnidade) return bloqueioUnidade;
  const body = await request.json().catch(() => ({}));
  const nomeArquivo = typeof body.nome_arquivo === "string" ? body.nome_arquivo : "aditivo";

  const safeFilename = nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `aditivos/${funcionarioId}/aditivo-${Date.now()}-${safeFilename}`;

  const svc = createServiceClient();
  const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) {
    console.error("[mot-eventos/aditivo-upload-url] Erro ao gerar URL de upload:", error.message);
    return NextResponse.json({ error: "Não foi possível preparar o envio do aditivo. Tente novamente." }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, token: data.token });
}
