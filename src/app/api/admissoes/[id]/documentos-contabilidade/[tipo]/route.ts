import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checarPapelAdmissoes } from "@/lib/admissaoAuth";
import { parseBody, admissaoDocumentoContabilidadeConfirmarSchema } from "@/lib/schemas";
import { DOCUMENTOS_CONTABILIDADE, type TipoDocumentoContabilidade } from "@/lib/contabilidadeDocumentosMatch";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ id: string; tipo: string }>;
}

const BUCKET = "admissao-docs";

function isTipoValido(tipo: string): tipo is TipoDocumentoContabilidade {
  return DOCUMENTOS_CONTABILIDADE.some((d) => d.tipo_documento === tipo);
}

// Mesmo mecanismo de signed URL já usado no upload de documentos do candidato (ver
// api/admissoes/token/[token]/documentos/[tipo]/route.ts): POST gera a URL assinada, o
// cliente sobe o arquivo direto pro Storage via PUT, e PATCH confirma gravando a linha
// em admissao_documentos_contabilidade. Só 1 arquivo por tipo — reenvio substitui
// (upsert por admissao_id+tipo_documento, que tem UNIQUE no banco).
export async function POST(request: NextRequest, { params }: Params) {
  const { id, tipo } = await params;
  if (!isTipoValido(tipo)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const body = await request.json().catch(() => ({}));
  const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim() : "arquivo.pdf";
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `docs-contabilidade/${id}/${tipo}-${Date.now()}-${safeFilename}`;

  const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, token: data.token });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, tipo } = await params;
  if (!isTipoValido(tipo)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(admissaoDocumentoContabilidadeConfirmarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data, error } = await svc
    .from("admissao_documentos_contabilidade")
    .upsert(
      { admissao_id: id, tipo_documento: tipo, storage_path: parsed.data.storage_path },
      { onConflict: "admissao_id,tipo_documento" }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_documento_contabilidade_enviado",
    entidade: "admissao_documentos_contabilidade",
    entidade_id: data.id,
    detalhes: { admissao_id: id, tipo_documento: tipo },
  });

  return NextResponse.json({ data });
}
