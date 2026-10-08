// Troca o envio SMTP real por um registro em db.emails — igual dos dois lados da comparação main x branch.
export async function sendEmail(opts) {
  const db = globalThis.__DB__;
  const falha = db.falhas?.["sendEmail"];
  if (falha) return { success: false, error: falha };
  (db.emails ??= []).push({ to: opts.to, subject: opts.subject, html: opts.html, tipo: opts.tipo ?? null, vaga_id: opts.vaga_id ?? null, candidato_id: opts.candidato_id ?? null });
  return { success: true };
}
export function obterRemetente() {
  return "teste@local";
}
