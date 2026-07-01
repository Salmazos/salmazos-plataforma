import { NextRequest, NextResponse } from "next/server";
import { parseBody, admissaoDocumentoConfirmarSchema } from "@/lib/schemas";
import { resolveAdmissaoByToken } from "@/lib/admissaoToken";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import { registrarAuditoria } from "@/lib/audit";

interface Params {
  params: Promise<{ token: string; tipo: string }>;
}

function isTipoValido(tipo: string): boolean {
  return DOCUMENTOS_ADMISSAO.some((d) => d.tipo_documento === tipo);
}

// Gera uma signed upload URL para o documento (candidato envia direto pro Storage).
export async function POST(request: NextRequest, { params }: Params) {
  const { token, tipo } = await params;
  if (!isTipoValido(tipo)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });

  const resolved = await resolveAdmissaoByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
  const { admissaoId, svc } = resolved;

  const body = await request.json().catch(() => ({}));
  const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim() : "arquivo";
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${admissaoId}/${tipo}/${Date.now()}-${safeFilename}`;

  const { data, error } = await svc.storage.from("admissao-docs").createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, path: data.path, token: data.token });
}

// Confirma que o upload terminou — grava o storage_path e marca como enviado.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { token, tipo } = await params;
  if (!isTipoValido(tipo)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });

  const resolved = await resolveAdmissaoByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
  const { admissaoId, svc } = resolved;

  const body = await request.json();
  const parsed = parseBody(admissaoDocumentoConfirmarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await svc
    .from("admissao_documentos")
    .update({
      storage_path: parsed.data.storage_path,
      status: "enviado",
      motivo_rejeicao: null,
    })
    .eq("admissao_id", admissaoId)
    .eq("tipo_documento", tipo)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: null,
    usuario_nome: "Candidato (autoatendimento)",
    acao: "admissao_documento_enviado",
    entidade: "admissao_documentos",
    entidade_id: data.id,
    detalhes: { admissao_id: admissaoId, tipo_documento: tipo },
  });

  return NextResponse.json({ data });
}
