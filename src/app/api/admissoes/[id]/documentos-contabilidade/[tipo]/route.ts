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
const SIGNED_URL_TTL_SECONDS = 900;
const TIPO_PACOTE_CONTABILIDADE = "contabilidade" as const;

function isTipoValido(tipo: string): tipo is TipoDocumentoContabilidade {
  return DOCUMENTOS_CONTABILIDADE.some((d) => d.tipo_documento === tipo);
}

// Signed URL para o time interno visualizar um documento da contabilidade já enviado
// (mesmo padrão de admissoes/[id]/documentos/[docId]/route.ts).
export async function GET(_request: NextRequest, { params }: Params) {
  const { id, tipo } = await params;
  if (!isTipoValido(tipo)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const svc = createServiceClient();

  const { data: doc, error } = await svc
    .from("admissao_documentos_contabilidade")
    .select("storage_path")
    .eq("admissao_id", id)
    .eq("tipo_documento", tipo)
    .single();
  if (error) return NextResponse.json({ error: "Documento ainda não enviado." }, { status: 404 });

  const { data, error: signError } = await svc.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: "admissao_documento_contabilidade_visualizado",
    entidade: "admissao_documentos_contabilidade",
    entidade_id: id,
    detalhes: { admissao_id: id, tipo_documento: tipo },
  });

  return NextResponse.json({ signedUrl: data.signedUrl });
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
  const acessoNegado = await checarPapelAdmissoes(user);
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
  const acessoNegado = await checarPapelAdmissoes(user);
  if (acessoNegado) return acessoNegado;

  const body = await request.json().catch(() => ({}));
  const parsed = parseBody(admissaoDocumentoContabilidadeConfirmarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();

  const { data: existente } = await svc
    .from("admissao_documentos_contabilidade")
    .select("id, storage_path")
    .eq("admissao_id", id)
    .eq("tipo_documento", tipo)
    .maybeSingle();

  // Substituição de um documento já enviado: só permitida enquanto não existir envelope
  // de assinatura do pacote da contabilidade pra esta admissão — depois de montado e
  // enviado pra assinatura, o PDF final já foi gerado a partir do arquivo antigo.
  if (existente) {
    const { data: envelope } = await svc
      .from("admissao_envelopes_assinatura")
      .select("id")
      .eq("admissao_id", id)
      .eq("tipo_pacote", TIPO_PACOTE_CONTABILIDADE)
      .maybeSingle();
    if (envelope) {
      return NextResponse.json(
        { error: "Este documento já foi incluído em um pacote enviado para assinatura — não é mais possível substituí-lo." },
        { status: 409 }
      );
    }
  }

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
    acao: existente ? "admissao_documento_contabilidade_substituido" : "admissao_documento_contabilidade_enviado",
    entidade: "admissao_documentos_contabilidade",
    entidade_id: data.id,
    detalhes: existente
      ? { admissao_id: id, tipo_documento: tipo, storage_path_antigo: existente.storage_path, storage_path_novo: parsed.data.storage_path }
      : { admissao_id: id, tipo_documento: tipo },
  });

  return NextResponse.json({ data });
}
