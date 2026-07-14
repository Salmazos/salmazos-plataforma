import crypto from "crypto";

// Cliente REST para a API v3 (Envelope) da Clicksign.
// Docs confirmadas em developers.clicksign.com/reference (ver notas pontuais abaixo,
// cada uma citando a página exata consultada):
//   - Criar envelope:            reference/api-criar-envelope
//   - Upload de documento:       reference/api-upload-documentos
//   - Criar signatário:          reference/api-criar-signatario
//   - Requisito de assinatura:   reference/criar-requisito-qualificacao   (action=agree, role=sign)
//   - Requisito de autenticação: reference/criar-requisito-de-autenticacao (action=provide_evidence, auth=email)
//   - Ativar envelope:           reference/api-editar-envelope            (PATCH status=running)
//   - Notificar signatário:      reference/api-notificar-signatario
//   - Evento de webhook de conclusão: docs/evento-document-closed → "document_closed"
//   - Assinatura HMAC do webhook:     docs/seguranca-de-webhooks → header "Content-Hmac: sha256=<hex>"
//
// Download do PDF final assinado — ATENÇÃO, ponto NÃO totalmente confirmado pela doc:
// a API v3 não documenta nenhum endpoint REST dedicado a download (conferido em toda a
// árvore de páginas listada em developers.clicksign.com/llms.txt — não existe nenhuma
// página sobre "download"). A única fonte documentada é o campo
// `document.downloads.signed_file_url` que vem dentro do payload do webhook
// "document_closed" (ver docs/exemplo-documento). Esse campo aparece nos exemplos da
// doc como um path relativo (ex: "/2023/03/13/xxxx_Clicksign.pdf"), e a doc não diz
// explicitamente contra qual domínio esse path deve ser resolvido. `baixarDocumentoAssinado`
// abaixo trata os dois casos (URL já absoluta, ou relativa — nesse caso prefixa com o
// host da API conforme CLICKSIGN_SANDBOX) mas isso é uma inferência, não um fato
// confirmado na doc. Validar contra um payload real de sandbox antes de confiar em
// produção — ver aviso também no PR/revisão deste arquivo.

const SANDBOX_BASE_URL = "https://sandbox.clicksign.com/api/v3";
const PRODUCTION_BASE_URL = "https://api.clicksign.com/api/v3";

function isSandbox(): boolean {
  return process.env.CLICKSIGN_SANDBOX === "true";
}

function baseUrl(): string {
  return isSandbox() ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
}

// Host usado para resolver paths relativos vindos de `downloads.*_url` — mesmo host da
// API em sandbox (confirmado: os links "self" do exemplo de resposta da doc apontam para
// sandbox.clicksign.com/api/v3/...). Em produção não há confirmação equivalente na doc;
// mantemos o host da API como melhor palpite documentável, mas ver aviso acima.
function fileHost(): string {
  return isSandbox() ? "https://sandbox.clicksign.com" : "https://api.clicksign.com";
}

function apiToken(): string {
  const token = process.env.CLICKSIGN_API_TOKEN;
  if (!token) throw new Error("CLICKSIGN_API_TOKEN não configurado.");
  return token;
}

async function clicksignFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      Authorization: apiToken(),
      ...init?.headers,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (json as any)?.errors?.map((e: { detail?: string; title?: string }) => e.detail ?? e.title).join("; ") ??
      `HTTP ${res.status}`;
    throw new Error(`[clicksign] ${path} falhou: ${detail}`);
  }
  return json as T;
}

// ── Envelope ───────────────────────────────────────────────────────────────

export interface ClicksignEnvelope {
  id: string;
  type: "envelopes";
}

export async function criarEnvelope(nome: string): Promise<ClicksignEnvelope> {
  const json = await clicksignFetch<{ data: ClicksignEnvelope }>("/envelopes", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "envelopes",
        attributes: {
          name: nome,
          locale: "pt-BR",
          auto_close: true,
        },
      },
    }),
  });
  return json.data;
}

// Ativa o envelope (draft → running). A partir daqui os signatários recebem acesso ao
// documento; não é possível voltar para draft (confirmado em reference/api-editar-envelope).
export async function ativarEnvelope(envelopeId: string): Promise<void> {
  await clicksignFetch(`/envelopes/${envelopeId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        id: envelopeId,
        type: "envelopes",
        attributes: { status: "running" },
      },
    }),
  });
}

// ── Documento ──────────────────────────────────────────────────────────────

export interface ClicksignDocumento {
  id: string;
  type: "documents";
}

export async function adicionarDocumento(
  envelopeId: string,
  filename: string,
  contentBase64: string,
  metadata?: Record<string, unknown>
): Promise<ClicksignDocumento> {
  const json = await clicksignFetch<{ data: ClicksignDocumento }>(`/envelopes/${envelopeId}/documents`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "documents",
        attributes: {
          filename,
          content_base64: contentBase64,
          ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
        },
      },
    }),
  });
  return json.data;
}

// ── Signatário ─────────────────────────────────────────────────────────────

export interface ClicksignSigner {
  id: string;
  type: "signers";
}

export async function adicionarSignatario(
  envelopeId: string,
  nome: string,
  email: string
): Promise<ClicksignSigner> {
  const json = await clicksignFetch<{ data: ClicksignSigner }>(`/envelopes/${envelopeId}/signers`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "signers",
        attributes: {
          name: nome,
          email,
          has_documentation: false,
          refusable: false,
          communicate_events: {
            signature_request: "email",
            signature_reminder: "email",
            document_signed: "email",
          },
        },
      },
    }),
  });
  return json.data;
}

// ── Requisitos (assinatura + autenticação por e-mail) ───────────────────────

// role=sign / action=agree — confirmado em reference/criar-requisito-qualificacao.
export async function adicionarRequisitoAssinatura(
  envelopeId: string,
  documentId: string,
  signerId: string
): Promise<void> {
  await clicksignFetch(`/envelopes/${envelopeId}/requirements`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "requirements",
        attributes: { action: "agree", role: "sign" },
        relationships: {
          document: { data: { type: "documents", id: documentId } },
          signer: { data: { type: "signers", id: signerId } },
        },
      },
    }),
  });
}

// auth=email — confirmado em reference/criar-requisito-de-autenticacao.
export async function adicionarRequisitoAutenticacaoEmail(
  envelopeId: string,
  documentId: string,
  signerId: string
): Promise<void> {
  await clicksignFetch(`/envelopes/${envelopeId}/requirements`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "requirements",
        attributes: { action: "provide_evidence", auth: "email" },
        relationships: {
          document: { data: { type: "documents", id: documentId } },
          signer: { data: { type: "signers", id: signerId } },
        },
      },
    }),
  });
}

// ── Notificação ──────────────────────────────────────────────────────────────

// Confirmado em reference/api-notificar-signatario.
export async function notificarSignatario(envelopeId: string, signerId: string, mensagem?: string): Promise<void> {
  await clicksignFetch(`/envelopes/${envelopeId}/signers/${signerId}/notifications`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "notifications",
        attributes: { message: mensagem ?? "Você recebeu um documento para assinar." },
      },
    }),
  });
}

// ── Fluxo completo de criação ────────────────────────────────────────────────

export interface CriarEnvelopeAssinaturaParams {
  nomeEnvelope: string;
  filename: string;
  contentBase64: string;
  nomeSignatario: string;
  emailSignatario: string;
  // Ecoado pela Clicksign no payload do webhook (document.metadata) — usado para
  // correlacionar o webhook de volta à admissão sem depender de IDs internos da
  // Clicksign, que podem divergir entre o schema da API v3 e o schema do webhook
  // (ver aviso no topo do arquivo).
  metadata?: Record<string, unknown>;
}

export interface CriarEnvelopeAssinaturaResult {
  envelopeId: string;
  documentId: string;
  signerId: string;
}

// Orquestra o fluxo descrito na doc de Envelope: cria envelope → adiciona documento →
// adiciona signatário → adiciona requisitos (assinatura + autenticação por e-mail) →
// ativa o envelope → notifica o signatário por e-mail.
export async function criarEnvelopeDeAssinatura(
  params: CriarEnvelopeAssinaturaParams
): Promise<CriarEnvelopeAssinaturaResult> {
  const envelope = await criarEnvelope(params.nomeEnvelope);
  const documento = await adicionarDocumento(envelope.id, params.filename, params.contentBase64, params.metadata);
  const signatario = await adicionarSignatario(envelope.id, params.nomeSignatario, params.emailSignatario);

  await adicionarRequisitoAssinatura(envelope.id, documento.id, signatario.id);
  await adicionarRequisitoAutenticacaoEmail(envelope.id, documento.id, signatario.id);

  await ativarEnvelope(envelope.id);
  await notificarSignatario(envelope.id, signatario.id);

  return { envelopeId: envelope.id, documentId: documento.id, signerId: signatario.id };
}

// ── Webhook: validação HMAC ──────────────────────────────────────────────────

// Header confirmado em docs/seguranca-de-webhooks: "Content-Hmac: sha256=<hex>".
// Hash = HMAC-SHA256(body_bruto, secret) — a doc é explícita que o corpo NÃO deve ser
// re-serializado/formatado antes do cálculo (usar os bytes exatamente como chegaram).
// Nome exato do header exportado para quem for ler/testar a rota de webhook.
export const CLICKSIGN_HMAC_HEADER = "content-hmac";

export function validarAssinaturaWebhook(rawBody: string, headerValue: string | null): boolean {
  if (!headerValue) return false;
  const secret = process.env.CLICKSIGN_WEBHOOK_SECRET;
  if (!secret) throw new Error("CLICKSIGN_WEBHOOK_SECRET não configurado.");

  const recebido = headerValue.replace(/^sha256=/, "").trim();
  const esperado = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const bufRecebido = Buffer.from(recebido, "hex");
  const bufEsperado = Buffer.from(esperado, "hex");
  if (bufRecebido.length !== bufEsperado.length) return false;
  return crypto.timingSafeEqual(bufRecebido, bufEsperado);
}

// ── Webhook: payload do evento document_closed ───────────────────────────────
// Nome do evento confirmado em docs/evento-document-closed: "document_closed".
export const CLICKSIGN_EVENTO_CONCLUSAO = "document_closed";

export interface ClicksignWebhookDocumento {
  key: string;
  filename?: string;
  // Espelha o que foi enviado em `adicionarDocumento(..., metadata)` na criação —
  // string JSON (não objeto), confirmado em reference/documento-campos-e-regras-de-negocio.
  metadata?: string;
  downloads?: {
    original_file_url?: string;
    signed_file_url?: string;
    ziped_file_url?: string;
  };
}

export interface ClicksignWebhookPayload {
  event: {
    name: string;
    data?: { account?: { key: string } };
    occurred_at: string;
  };
  document: ClicksignWebhookDocumento | ClicksignWebhookDocumento[];
}

// Baixa o PDF final assinado a partir da URL informada no payload do webhook.
// Ver aviso no topo do arquivo: se a URL vier relativa, o prefixo de host usado aqui é
// uma inferência (mesmo host da API), não um fato 100% confirmado pela doc — validar
// com um webhook real de sandbox antes de depender disso em produção.
export async function baixarDocumentoAssinado(signedFileUrl: string): Promise<Buffer> {
  const url = signedFileUrl.startsWith("http") ? signedFileUrl : `${fileHost()}${signedFileUrl}`;
  const res = await fetch(url, {
    headers: { Authorization: apiToken() },
  });
  if (!res.ok) throw new Error(`[clicksign] Falha ao baixar documento assinado: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
