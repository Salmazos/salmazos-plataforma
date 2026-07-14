import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import {
  CLICKSIGN_EVENTO_CONCLUSAO,
  CLICKSIGN_HMAC_HEADER,
  validarAssinaturaWebhook,
  baixarDocumentoAssinado,
  type ClicksignWebhookPayload,
  type ClicksignWebhookDocumento,
} from "@/lib/clicksign";

const BUCKET = "admissao-docs";

// Endpoint chamado pela Clicksign (server-to-server, sem sessão de usuário) quando um
// documento de admissão é concluído. NUNCA deve reenviar/expor o PDF assinado ao
// candidato — a única coisa feita aqui é salvar a via do emissor no bucket privado
// (mesmo bucket "admissao-docs" usado pelo resto do módulo de admissão, que já é
// privado: RLS + storage policy restrita a authenticated/service_role) e marcar a
// admissão como assinada.
export async function POST(request: NextRequest) {
  // A validação HMAC exige o corpo bruto, exatamente como recebido — não formatar/
  // reserializar antes (confirmado em docs/seguranca-de-webhooks). Por isso lemos
  // como texto primeiro e só fazemos JSON.parse depois de validar a assinatura.
  const rawBody = await request.text();
  const assinaturaHeader = request.headers.get(CLICKSIGN_HMAC_HEADER);

  let assinaturaValida: boolean;
  try {
    assinaturaValida = validarAssinaturaWebhook(rawBody, assinaturaHeader);
  } catch (err) {
    console.error("[POST /api/webhooks/clicksign] Erro ao validar HMAC", err);
    return NextResponse.json({ error: "Erro ao validar assinatura do webhook." }, { status: 500 });
  }
  if (!assinaturaValida) {
    return NextResponse.json({ error: "Assinatura HMAC inválida." }, { status: 401 });
  }

  let payload: ClicksignWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
  }

  // Só reagimos ao evento de conclusão ("document_closed" — confirmado em
  // docs/evento-document-closed). Outros eventos (open, upload, refusal etc.) são
  // apenas confirmados com 200 pra Clicksign não ficar reentregando.
  if (payload.event?.name !== CLICKSIGN_EVENTO_CONCLUSAO) {
    return NextResponse.json({ ok: true, ignorado: payload.event?.name ?? null });
  }

  const documentos: ClicksignWebhookDocumento[] = Array.isArray(payload.document)
    ? payload.document
    : payload.document
      ? [payload.document]
      : [];

  if (documentos.length === 0) {
    return NextResponse.json({ error: "Payload sem documento." }, { status: 400 });
  }

  const svc = createServiceClient();
  const resultados: { admissaoId: string; ok: boolean; erro?: string }[] = [];

  for (const doc of documentos) {
    let admissaoId: string | undefined;
    try {
      const metadata = doc.metadata ? JSON.parse(doc.metadata) : null;
      admissaoId = metadata?.admissao_id;
    } catch {
      admissaoId = undefined;
    }

    if (!admissaoId) {
      console.error("[POST /api/webhooks/clicksign] Documento sem admissao_id em metadata", { documentKey: doc.key });
      resultados.push({ admissaoId: "desconhecida", ok: false, erro: "metadata.admissao_id ausente ou inválido" });
      continue;
    }

    const signedFileUrl = doc.downloads?.signed_file_url;
    if (!signedFileUrl) {
      resultados.push({ admissaoId, ok: false, erro: "downloads.signed_file_url ausente no payload" });
      continue;
    }

    try {
      const pdfBuffer = await baixarDocumentoAssinado(signedFileUrl);
      const uploadPath = `assinaturas/${admissaoId}/assinado-${Date.now()}.pdf`;

      const { error: uploadError } = await svc.storage
        .from(BUCKET)
        .upload(uploadPath, pdfBuffer, { contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);

      const assinadoEm = new Date().toISOString();
      const { error: updateError } = await svc
        .from("admissoes")
        .update({ assinatura_em: assinadoEm, assinatura_path: uploadPath })
        .eq("id", admissaoId);
      if (updateError) throw new Error(updateError.message);

      registrarAuditoria({
        acao: "admissao_assinatura_clicksign_concluida",
        entidade: "admissoes",
        entidade_id: admissaoId,
        detalhes: { document_key: doc.key, storage_path: uploadPath },
      });

      resultados.push({ admissaoId, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[POST /api/webhooks/clicksign] Falha ao processar documento", { admissaoId, erro: msg });
      resultados.push({ admissaoId, ok: false, erro: msg });
    }
  }

  const algumFalhou = resultados.some((r) => !r.ok);
  // 207-like: reportamos o detalhe por documento, mas usamos 500 se algo falhou pra
  // Clicksign considerar reentregar o webhook (retry) em vez de descartar como sucesso.
  return NextResponse.json({ resultados }, { status: algumFalhou ? 500 : 200 });
}
