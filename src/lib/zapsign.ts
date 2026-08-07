import crypto from "crypto";
import { RUBRICA_POSICAO_PADRAO, type AncoraDetectada } from "@/lib/pdfAnchors";

// Cliente REST pra API da ZapSign (paralelo a lib/clicksign.ts) — usado só no pacote de
// assinatura da contabilidade (7 tipos de documento). O pacote 'interno' continua na
// Clicksign por enquanto (ver nota em api/admissoes/[id]/documentos-contabilidade/
// montar-enviar/route.ts sobre o campo `provedor`).
//
// Docs oficiais consultadas em 2026-07-31 (docs.zapsign.com.br):
//   - Auth: header Authorization: Bearer {token} (token estático, Configurações >
//     Integrações > API ZAPSIGN — confirmado que o mesmo token NÃO funciona no ambiente
//     sandbox; sandbox exige login/token próprios em sandbox.app.zapsign.com.br, apesar
//     da doc dizer o contrário — confirmado na prática nesta sessão).
//   - Upload:      POST /api/v1/docs/
//   - Posicionar:  POST /api/v1/docs/{doc_token}/place-signatures/ — coordenadas são
//     RELATIVAS (0-100), não pontos absolutos do PDF.
//   - IMPORTANTE (segurança): webhook da ZapSign NÃO tem HMAC real — só permite
//     configurar um header estático (você escolhe o valor) que ela ecoa de volta em
//     toda chamada. Isso é uma simples comparação de string, não uma assinatura
//     criptográfica do corpo — ver validação adicional em api/webhooks/zapsign/route.ts.

const SANDBOX_BASE_URL = "https://sandbox.api.zapsign.com.br";
const PRODUCTION_BASE_URL = "https://api.zapsign.com.br";

function isSandbox(): boolean {
  return process.env.ZAPSIGN_SANDBOX === "true";
}

function baseUrl(): string {
  return isSandbox() ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
}

function apiToken(): string {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error("ZAPSIGN_API_TOKEN não configurado.");
  return token;
}

// Retry básico: só pra falha de rede ou erro 5xx (instabilidade transitória do lado da
// ZapSign) — erros 4xx (payload/auth inválidos) não se corrigem tentando de novo, então
// falham na primeira tentativa mesmo.
async function zapsignFetch<T>(path: string, init?: RequestInit, tentativa = 1): Promise<T> {
  const url = `${baseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken()}`,
        ...init?.headers,
      },
    });
  } catch (err) {
    if (tentativa < 2) return zapsignFetch<T>(path, init, tentativa + 1);
    throw new Error(`[zapsign] ${path} falhou (rede): ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.status >= 500 && tentativa < 2) {
    return zapsignFetch<T>(path, init, tentativa + 1);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (json as any)?.detail ?? (json as any)?.message ?? `HTTP ${res.status}`;
    throw new Error(`[zapsign] ${path} falhou: ${detail}`);
  }
  return json as T;
}

// ── Documento ────────────────────────────────────────────────────────────────

export interface ZapSignSignerInput {
  name: string;
  email: string;
  cpf?: string;
  auth_mode?: string;
}

export interface ZapSignSignerResult {
  token: string;
  name: string;
  email: string;
  sign_url: string;
  status: string;
}

export interface ZapSignDocumento {
  token: string;
  name: string;
  status: string;
  signers: ZapSignSignerResult[];
}

export async function criarDocumento(params: {
  name: string;
  base64Pdf: string;
  signers: ZapSignSignerInput[];
}): Promise<ZapSignDocumento> {
  return zapsignFetch<ZapSignDocumento>("/api/v1/docs/", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      base64_pdf: params.base64Pdf,
      signers: params.signers,
      lang: "pt-br",
    }),
  });
}

// ── Posicionamento ───────────────────────────────────────────────────────────

export interface ZapSignRubrica {
  page: number; // 0-indexed
  relative_position_left: number;
  relative_position_bottom: number;
  relative_size_x: number;
  relative_size_y: number;
  signer_token: string;
  type: "signature" | "visto";
}

export async function posicionarAssinaturas(docToken: string, rubricas: ZapSignRubrica[]): Promise<void> {
  await zapsignFetch(`/api/v1/docs/${docToken}/place-signatures/`, {
    method: "POST",
    body: JSON.stringify({ rubricas }),
  });
}

// ── Orquestração: upload + detecção de âncora + posicionamento ──────────────

// Tamanho padrão da caixa de assinatura/rubrica, em % da página — mesmo valor pros dois
// tipos por simplicidade; ajustar aqui se o teste visual (Passo 7) pedir.
const TAMANHO_CAIXA = { relative_size_x: 22, relative_size_y: 5 } as const;

export interface ContratanteFixo {
  nome: string;
  cpf: string;
  email: string;
}

export interface ContratadoDados {
  nome: string;
  email: string;
  cpf?: string;
}

// Override de posição de rubrica pra uma página específica — usado só quando o fallback
// global (RUBRICA_POSICAO_PADRAO) colide com o layout de um documento específico (ex:
// termo_lgpd_novacki, um termo denso que não sobra margem no canto superior direito
// padrão — ver lib/zapsignPosicoes.ts). `pagina` é o índice absoluto (0-indexed) no PDF
// final combinado, igual a AncoraDetectada.
export interface RubricaExtra {
  pagina: number;
  papel: "contratante" | "contratado";
  relative_position_left: number;
  relative_position_bottom: number;
}

export interface CriarDocumentoComPosicionamentoParams {
  nomeDocumento: string;
  pdfBytes: Uint8Array;
  contratante: ContratanteFixo;
  contratado: ContratadoDados;
  // Posições de assinatura/rubrica JÁ RESOLVIDAS pelo chamador (ver lib/zapsignPosicoes.ts
  // — tabela fixa calibrada contra um caso real, não mais detecção de texto em tempo de
  // execução). `pagina` é o índice absoluto (0-indexed) no PDF final combinado.
  ancoras: AncoraDetectada[];
  totalPaginas: number;
  // Páginas de rubrica com posição própria (ver RubricaExtra acima) — sobrepõe
  // RUBRICA_POSICAO_PADRAO só nessas páginas específicas; todas as demais páginas sem
  // âncora continuam usando o padrão global normalmente.
  rubricasExtras?: RubricaExtra[];
}

export interface CriarDocumentoComPosicionamentoResult {
  documentToken: string;
  signerTokenContratante: string;
  signerTokenContratado: string;
  paginasComAncora: number;
  paginasComRubrica: number;
}

export async function criarDocumentoComPosicionamento(
  params: CriarDocumentoComPosicionamentoParams
): Promise<CriarDocumentoComPosicionamentoResult> {
  const { ancoras, totalPaginas } = params;
  const base64Pdf = Buffer.from(params.pdfBytes).toString("base64");

  const documento = await criarDocumento({
    name: params.nomeDocumento,
    base64Pdf,
    signers: [
      { name: params.contratante.nome, email: params.contratante.email, cpf: params.contratante.cpf },
      { name: params.contratado.nome, email: params.contratado.email, cpf: params.contratado.cpf },
    ],
  });

  const signerContratante = documento.signers[0];
  const signerContratado = documento.signers[1];

  const rubricas: ZapSignRubrica[] = ancoras.map((a) => ({
    page: a.pagina,
    relative_position_left: a.relative_position_left,
    relative_position_bottom: a.relative_position_bottom,
    ...TAMANHO_CAIXA,
    signer_token: a.papel === "contratante" ? signerContratante.token : signerContratado.token,
    type: "signature",
  }));

  // Páginas sem nenhuma âncora (nem contratante nem contratado) — rubrica de AMBAS as
  // partes na posição fixa padrão, OU na posição própria da página quando o chamador
  // passou um override em rubricasExtras (ver RubricaExtra acima). Decisão explícita:
  // como o mapeamento original não define quem rubrica as páginas do meio, optamos por
  // incluir os dois (mais seguro pedir rubrica a mais do que faltar a de uma parte num
  // documento assinado).
  const rubricasExtrasPorPagina = new Map<number, RubricaExtra[]>();
  for (const extra of params.rubricasExtras ?? []) {
    const lista = rubricasExtrasPorPagina.get(extra.pagina) ?? [];
    lista.push(extra);
    rubricasExtrasPorPagina.set(extra.pagina, lista);
  }

  const paginasComAncora = new Set(ancoras.map((a) => a.pagina));
  let paginasComRubrica = 0;
  for (let pagina = 0; pagina < totalPaginas; pagina++) {
    if (paginasComAncora.has(pagina)) continue;
    paginasComRubrica++;
    const extras = rubricasExtrasPorPagina.get(pagina);
    if (extras && extras.length > 0) {
      for (const extra of extras) {
        rubricas.push({
          page: pagina,
          relative_position_left: extra.relative_position_left,
          relative_position_bottom: extra.relative_position_bottom,
          ...TAMANHO_CAIXA,
          signer_token: extra.papel === "contratante" ? signerContratante.token : signerContratado.token,
          type: "visto",
        });
      }
      continue;
    }
    rubricas.push(
      { page: pagina, ...RUBRICA_POSICAO_PADRAO.contratante, ...TAMANHO_CAIXA, signer_token: signerContratante.token, type: "visto" },
      { page: pagina, ...RUBRICA_POSICAO_PADRAO.contratado, ...TAMANHO_CAIXA, signer_token: signerContratado.token, type: "visto" }
    );
  }

  await posicionarAssinaturas(documento.token, rubricas);

  return {
    documentToken: documento.token,
    signerTokenContratante: signerContratante.token,
    signerTokenContratado: signerContratado.token,
    paginasComAncora: paginasComAncora.size,
    paginasComRubrica,
  };
}

// ── Documento (consulta) ─────────────────────────────────────────────────────

export async function obterDocumento(docToken: string): Promise<ZapSignDocumento> {
  return zapsignFetch<ZapSignDocumento>(`/api/v1/docs/${docToken}/`, { method: "GET" });
}

// ── Webhook: registro + validação de segurança ───────────────────────────────
//
// AVISO DE SEGURANÇA: a ZapSign NÃO oferece HMAC real no webhook — só permite
// configurar um header customizado estático (nome + valor escolhidos por quem registra
// o webhook, ver criarWebhook abaixo), que ela ecoa de volta em toda chamada. Isso é uma
// simples comparação de string contra um segredo compartilhado, SEM nenhuma assinatura
// criptográfica do corpo da requisição — ao contrário do Content-Hmac real da Clicksign
// (ver lib/clicksign.ts, que assina o corpo bruto com HMAC-SHA256). Ou seja: quem
// descobrir o valor do header consegue forjar uma chamada de webhook válida. Mitigação
// extra usada em api/webhooks/zapsign/route.ts: só processar se o `token` do documento
// bater com um registro com status='pendente' em admissao_envelopes_assinatura — não
// elimina o risco, só reduz a superfície de um webhook forjado causar efeito real.
export const ZAPSIGN_WEBHOOK_HEADER_NAME = "x-zapsign-webhook-secret";

export function validarHeaderWebhook(headerValue: string | null): boolean {
  const esperado = process.env.ZAPSIGN_WEBHOOK_SECRET;
  if (!esperado) throw new Error("ZAPSIGN_WEBHOOK_SECRET não configurado.");
  if (!headerValue) return false;

  const bufRecebido = Buffer.from(headerValue);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecebido.length !== bufEsperado.length) return false;
  return crypto.timingSafeEqual(bufRecebido, bufEsperado);
}

// Baixa o arquivo final (assinado ou original) a partir da URL do payload do webhook.
// Confirmado em teste real nesta sessão: a ZapSign devolve URL ABSOLUTA presignada do
// S3 (mesmo padrão da Clicksign) — sem precisar de header Authorization, a autenticação
// já está na query string.
export async function baixarArquivoZapSign(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`[zapsign] Falha ao baixar arquivo: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Registro do webhook na ZapSign — chamado uma vez (setup manual/script), não em
// produção a cada documento. Usa o mesmo header estático descrito acima.
export async function criarWebhook(url: string, tipo: string): Promise<void> {
  const secret = process.env.ZAPSIGN_WEBHOOK_SECRET;
  if (!secret) throw new Error("ZAPSIGN_WEBHOOK_SECRET não configurado.");
  await zapsignFetch("/api/v1/user/company/webhook/", {
    method: "POST",
    body: JSON.stringify({
      url,
      type: tipo,
      headers: [{ name: ZAPSIGN_WEBHOOK_HEADER_NAME, value: secret }],
    }),
  });
}
