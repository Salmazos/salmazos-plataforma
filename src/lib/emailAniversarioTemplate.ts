// Envelope HTML compartilhado por todos os e-mails do módulo Aniversários (cron da Fase B
// e felicitação manual da Fase D) — preto/dourado, mesmo padrão visual da marca.
export function envolucroAniversario(titulo: string, conteudo: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
  <div style="background:#000;padding:24px 28px;text-align:center">
    <h1 style="color:#FFD700;margin:0;font-size:18px">${titulo}</h1>
  </div>
  <div style="padding:24px 28px">
    ${conteudo}
  </div>
  <div style="background:#f9fafb;padding:12px 28px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9CA3AF">Salmazos RH — Lembrete automático de aniversário</p>
  </div>
</div>
</body></html>`;
}

export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
