import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseBody, admissaoDocumentoRevisarSchema } from "@/lib/schemas";
import { registrarAuditoria } from "@/lib/audit";
import { DOCUMENTOS_ADMISSAO } from "@/lib/admissaoDocumentos";
import { linkDocumentoRejeitadoWhatsapp } from "@/lib/waLinks";

interface Params {
  params: Promise<{ id: string; docId: string }>;
}

// Signed URL para o time interno visualizar o documento enviado.
export async function GET(_request: NextRequest, { params }: Params) {
  const { id, docId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svc = createServiceClient();

  const { data: doc, error } = await svc
    .from("admissao_documentos")
    .select("storage_path")
    .eq("id", docId)
    .eq("admissao_id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (!doc.storage_path) return NextResponse.json({ error: "Documento ainda não enviado." }, { status: 400 });

  const { data, error: signError } = await svc.storage
    .from("admissao-docs")
    .createSignedUrl(doc.storage_path, 60);

  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}

// Aprova ou rejeita um documento enviado pelo candidato.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, docId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = parseBody(admissaoDocumentoRevisarSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { status, motivo_rejeicao } = parsed.data;

  const svc = createServiceClient();

  const { data: doc, error } = await svc
    .from("admissao_documentos")
    .update({
      status,
      motivo_rejeicao: status === "rejeitado" ? motivo_rejeicao : null,
    })
    .eq("id", docId)
    .eq("admissao_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  registrarAuditoria({
    usuario_id: user.id,
    usuario_nome: user.email ?? null,
    acao: status === "aprovado" ? "admissao_documento_aprovado" : "admissao_documento_rejeitado",
    entidade: "admissao_documentos",
    entidade_id: docId,
    detalhes: { admissao_id: id, tipo_documento: doc.tipo_documento, motivo_rejeicao: doc.motivo_rejeicao },
  });

  let whatsappUrl: string | null = null;
  if (status === "rejeitado") {
    const { data: admissao } = await svc
      .from("admissoes")
      .select("token, candidatos(nome_completo, telefone)")
      .eq("id", id)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidato = (admissao as any)?.candidatos as { nome_completo: string; telefone: string } | null;
    if (admissao && candidato?.telefone) {
      const admissaoUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/admissao/${admissao.token}`;
      const label = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === doc.tipo_documento)?.label ?? doc.tipo_documento;
      whatsappUrl = linkDocumentoRejeitadoWhatsapp(candidato.nome_completo, candidato.telefone, label, motivo_rejeicao ?? "", admissaoUrl);
    }
  }

  return NextResponse.json({ data: doc, whatsappUrl });
}
