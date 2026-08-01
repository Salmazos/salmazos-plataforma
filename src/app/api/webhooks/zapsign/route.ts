import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/audit";
import {
  ZAPSIGN_WEBHOOK_HEADER_NAME,
  validarHeaderWebhook,
  baixarArquivoZapSign,
} from "@/lib/zapsign";

const BUCKET = "admissao-docs";

// Endpoint chamado pela ZapSign (server-to-server) quando um documento é assinado.
// Mesma regra de negócio do webhook da Clicksign (ver api/webhooks/clicksign/route.ts):
// NUNCA reenviar/expor o PDF assinado ao candidato — só salva a via do emissor no
// bucket privado e marca o envelope como assinado.
//
// FORMATO DO PAYLOAD CONFIRMADO com payload real de sandbox (2 signatários, 2026-07-31):
// campos ficam na RAIZ do payload (não aninhados em "document" como a Clicksign) —
// `token`, `status`, `signed_file`, `signers[]`, e o nome do evento vem em `event_type`
// (não `event`/`type`, como se supunha antes de confirmar). ATENÇÃO: com N signatários,
// a ZapSign dispara "doc_signed" UMA VEZ POR SIGNATÁRIO que termina de assinar, não só
// quando todos terminam — no payload real, a 1a chamada (só o primeiro signatário
// concluído) já veio com event_type="doc_signed" mas status="pending". Por isso o gate
// abaixo é no `status` do documento ("signed" = todos assinaram), não no nome do evento.
export async function POST(request: NextRequest) {
  const headerValue = request.headers.get(ZAPSIGN_WEBHOOK_HEADER_NAME);

  let headerValido: boolean;
  try {
    headerValido = validarHeaderWebhook(headerValue);
  } catch (err) {
    console.error("[POST /api/webhooks/zapsign] Erro ao validar header do webhook", err);
    return NextResponse.json({ error: "Erro ao validar header do webhook." }, { status: 500 });
  }
  if (!headerValido) {
    return NextResponse.json({ error: "Header de segurança inválido." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
  }

  // Só reagimos ao evento de assinatura — outros eventos (doc_created, doc_viewed etc.)
  // são só confirmados com 200 pra ZapSign não ficar reentregando.
  const evento = payload.event_type as string | undefined;
  if (evento !== "doc_signed") {
    return NextResponse.json({ ok: true, ignorado: evento ?? null });
  }

  const documentToken = payload.token as string | undefined;
  if (!documentToken) {
    console.error("[POST /api/webhooks/zapsign] Payload sem token de documento", payload);
    return NextResponse.json({ error: "Payload sem token de documento." }, { status: 400 });
  }

  // Documento com N>1 signatários dispara doc_signed a cada assinatura individual —
  // só o documento inteiro completo (status="signed") tem o PDF final de verdade.
  // Confirmar aqui evita salvar um arquivo parcial como se fosse o definitivo.
  if (payload.status !== "signed") {
    return NextResponse.json({ ok: true, aguardando: "outros signatários" });
  }

  const svc = createServiceClient();

  // Validação adicional além do header estático (ver aviso de segurança em
  // lib/zapsign.ts): só processa se existir um envelope PENDENTE pra esse token — um
  // webhook forjado (header vazado) não consegue disparar reprocessamento de um
  // documento já assinado nem de um token que nunca existiu aqui.
  const { data: envelope, error: envelopeError } = await svc
    .from("admissao_envelopes_assinatura")
    .select("id, admissao_id, tipo_pacote, status")
    .eq("documento_externo_id", documentToken)
    .eq("provedor", "zapsign")
    .maybeSingle();

  if (envelopeError || !envelope) {
    console.error(
      `[POST /api/webhooks/zapsign] Nenhum envelope pendente encontrado para token=${documentToken}`
    );
    return NextResponse.json({ error: "Envelope não encontrado para este token." }, { status: 404 });
  }

  // Entrega duplicada do webhook — já processado, não repete download/upload.
  if (envelope.status === "assinado") {
    return NextResponse.json({ ok: true });
  }

  const fileUrl = payload.signed_file as string | undefined;

  if (!fileUrl) {
    console.error("[POST /api/webhooks/zapsign] Payload sem URL de arquivo assinado", payload);
    return NextResponse.json({ error: "Payload sem URL de arquivo assinado." }, { status: 400 });
  }

  try {
    const pdfBuffer = await baixarArquivoZapSign(fileUrl);
    const uploadPath = `assinaturas/${envelope.admissao_id}/assinado-${Date.now()}.pdf`;

    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(uploadPath, pdfBuffer, { contentType: "application/pdf" });
    if (uploadError) throw new Error(uploadError.message);

    const assinadoEm = new Date().toISOString();
    const { error: updateError } = await svc
      .from("admissao_envelopes_assinatura")
      .update({ status: "assinado", assinado_em: assinadoEm, path: uploadPath })
      .eq("id", envelope.id);
    if (updateError) throw new Error(updateError.message);

    registrarAuditoria({
      acao: "admissao_assinatura_zapsign_concluida",
      entidade: "admissoes",
      entidade_id: envelope.admissao_id,
      detalhes: { document_token: documentToken, tipo_pacote: envelope.tipo_pacote, storage_path: uploadPath },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[POST /api/webhooks/zapsign] Falha ao processar documento", { documentToken, erro: msg });
    // 500 pra ZapSign considerar reentregar (retry) em vez de descartar como sucesso.
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
