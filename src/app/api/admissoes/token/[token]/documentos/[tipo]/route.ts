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

// Tipos de documento de dependente aceitam múltiplos arquivos (um por dependente, sem
// vínculo nominal) — cada admissão nasce com só 1 linha por tipo (ver POST /api/admissoes),
// então a partir do 2º arquivo é preciso criar linhas novas em vez de sobrescrever.
const MAX_ARQUIVOS_POR_TIPO = 10;

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

  const def = DOCUMENTOS_ADMISSAO.find((d) => d.tipo_documento === tipo)!;
  const aceitaMultiplos = def.condicional === "dependente";

  let data;
  if (parsed.data.doc_id) {
    // Reenvio de uma linha específica (ex.: arquivo rejeitado de um tipo com múltiplos
    // arquivos) — substitui só aquela linha, nunca cria uma nova.
    const { data: updated, error } = await svc
      .from("admissao_documentos")
      .update({ storage_path: parsed.data.storage_path, status: "enviado", motivo_rejeicao: null })
      .eq("id", parsed.data.doc_id)
      .eq("admissao_id", admissaoId)
      .eq("tipo_documento", tipo)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    data = updated;
  } else if (aceitaMultiplos) {
    // Reaproveita a linha semeada na criação da admissão (ainda sem arquivo) se existir;
    // senão cria uma linha nova — é assim que o mesmo tipo passa a comportar vários arquivos.
    const { data: slotVazio } = await svc
      .from("admissao_documentos")
      .select("id")
      .eq("admissao_id", admissaoId)
      .eq("tipo_documento", tipo)
      .is("storage_path", null)
      .limit(1)
      .maybeSingle();

    if (slotVazio) {
      const { data: updated, error } = await svc
        .from("admissao_documentos")
        .update({ storage_path: parsed.data.storage_path, status: "enviado", motivo_rejeicao: null })
        .eq("id", slotVazio.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      data = updated;
    } else {
      const { count } = await svc
        .from("admissao_documentos")
        .select("id", { count: "exact", head: true })
        .eq("admissao_id", admissaoId)
        .eq("tipo_documento", tipo);
      if ((count ?? 0) >= MAX_ARQUIVOS_POR_TIPO) {
        return NextResponse.json({ error: `Limite de ${MAX_ARQUIVOS_POR_TIPO} arquivos por documento atingido.` }, { status: 400 });
      }

      const { data: inserted, error } = await svc
        .from("admissao_documentos")
        .insert({
          admissao_id: admissaoId,
          tipo_documento: tipo,
          obrigatorio: def.obrigatorio,
          condicional: def.condicional,
          storage_path: parsed.data.storage_path,
          status: "enviado",
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      data = inserted;
    }
  } else {
    const { data: updated, error } = await svc
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
    data = updated;
  }

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
