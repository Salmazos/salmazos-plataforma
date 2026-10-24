// Escapa o que vem de fora (por exemplo, o que o cliente digita no link público) antes de entrar em HTML de e-mail.
// Função pura e sem imports, para ser verificada em scripts/verificar-solicitacao-link.mts.
export function escaparHtml(valor: string | number | null | undefined): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
