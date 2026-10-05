// Domínio de produção FIXO dos links de e-mail e dos avisos. Não lê variável de ambiente de propósito:
// NEXT_PUBLIC_SITE_URL pode apontar para outro domínio, ter barra no final ou faltar (link relativo quebrado
// em e-mail). Previews também apontam para produção, o que é o desejado para quem recebe o e-mail.
export const SITE_URL = "https://vagas.salmazos.com.br";

// Link absoluto para um caminho do app ("/painel/vagas/123" ou "painel/vagas/123").
export function urlSite(caminho: string): string {
  return `${SITE_URL}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}
