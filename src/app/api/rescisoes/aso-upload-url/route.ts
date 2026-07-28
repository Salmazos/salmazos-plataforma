import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelFuncionarios } from "@/lib/funcionariosAuth";

// Reaproveita o bucket privado "admissao-docs" (já usado pelo módulo de Admissão Digital)
// em vez de criar um bucket novo só pro ASO — mesmo padrão de pastas por categoria dentro
// do mesmo bucket já usado ali (pacotes-contabilidade/, assinaturas/), aqui em
// rescisoes-aso/. Signed upload URL: o cliente envia o arquivo direto pro Storage, sem
// passar o binário pela função serverless (mesmo padrão de /api/documentos/upload-url).
const BUCKET = "admissao-docs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelFuncionarios(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const funcionarioId = typeof body.funcionario_id === "string" ? body.funcionario_id.trim() : "";
  const nomeArquivo = typeof body.nome_arquivo === "string" ? body.nome_arquivo : "aso";
  if (!funcionarioId) return NextResponse.json({ error: "funcionario_id é obrigatório." }, { status: 400 });

  const safeFilename = nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `rescisoes-aso/${funcionarioId}/aso-${Date.now()}-${safeFilename}`;

  const svc = createServiceClient();
  const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, token: data.token });
}
