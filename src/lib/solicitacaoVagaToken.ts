import { randomBytes } from "node:crypto";

// Token do link público de solicitação de vaga: "<slug-da-empresa>-<12 caracteres aleatórios>" (ex.: "acme-industria-7kQ2mXp9RbTw") ou
// só os 12 caracteres quando o link não tem nome de empresa. O slug é só para o analista e o cliente reconhecerem o link: não é
// segredo e vem apenas do nome que o analista digitou. A segurança está nos 12 caracteres aleatórios (62^12, cerca de 71 bits).
// Links criados antes (32 caracteres, base64url de 24 bytes) continuam válidos: o formato legado é aceito na leitura, nunca gerado.

export const ALFABETO_BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const TAMANHO_ALEATORIO = 12;
export const TAMANHO_MAX_SLUG = 30;
export const TENTATIVAS_TOKEN = 3;

// Maior múltiplo de 62 que cabe em um byte: bytes de 248 a 255 são descartados, senão os 8 primeiros caracteres do alfabeto
// (255 % 62 = 7) saíam mais do que os demais.
const LIMITE_SEM_VIES = 248;

type FonteDeBytes = (quantidade: number) => Uint8Array;

export function aleatorioBase62(tamanho = TAMANHO_ALEATORIO, bytes: FonteDeBytes = randomBytes): string {
  let texto = "";
  while (texto.length < tamanho) {
    for (const b of bytes(tamanho * 2)) {
      if (b >= LIMITE_SEM_VIES) continue;
      texto += ALFABETO_BASE62[b % ALFABETO_BASE62.length];
      if (texto.length === tamanho) break;
    }
  }
  return texto;
}

// Sem acento, minúsculo, só letras, números e hífen, no máximo 30 caracteres. Nome vazio (ou só símbolos) = sem slug.
export function slugDaEmpresa(nome: string | null | undefined): string {
  const base = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, TAMANHO_MAX_SLUG).replace(/-+$/g, "");
}

export function gerarTokenLink(nomeEmpresa: string | null | undefined, bytes: FonteDeBytes = randomBytes): string {
  const aleatorio = aleatorioBase62(TAMANHO_ALEATORIO, bytes);
  const slug = slugDaEmpresa(nomeEmpresa);
  return slug ? `${slug}-${aleatorio}` : aleatorio;
}

const FORMATO_NOVO = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?[A-Za-z0-9]{12}$/;
const FORMATO_LEGADO = /^[A-Za-z0-9_-]{32}$/;
const TAMANHO_MAX_NOVO = TAMANHO_MAX_SLUG + 1 + TAMANHO_ALEATORIO;

// Confere só o formato, antes de qualquer consulta ao banco.
export function formatoTokenValido(token: unknown): token is string {
  if (typeof token !== "string") return false;
  if (FORMATO_LEGADO.test(token)) return true;
  return token.length <= TAMANHO_MAX_NOVO && FORMATO_NOVO.test(token);
}

// Insere o link com um token novo a cada tentativa. Colisão no índice único (23505) gera outra tentativa, no máximo 3; qualquer outro
// erro, ou a terceira colisão, devolve o erro. O token nunca é logado aqui nem pelo chamador (quem loga usa só o código do erro).
export async function inserirComTokenNovo<T>(
  nomeEmpresa: string | null | undefined,
  inserir: (token: string) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
  gerar: (nome: string | null | undefined) => string = gerarTokenLink
): Promise<{ data: T | null; error: { code?: string; message?: string } | null; tentativas: number }> {
  let ultimo: { data: T | null; error: { code?: string; message?: string } | null } = { data: null, error: null };
  for (let tentativa = 1; tentativa <= TENTATIVAS_TOKEN; tentativa++) {
    ultimo = await inserir(gerar(nomeEmpresa));
    if (!ultimo.error || ultimo.error.code !== "23505") return { ...ultimo, tentativas: tentativa };
  }
  return { ...ultimo, tentativas: TENTATIVAS_TOKEN };
}
