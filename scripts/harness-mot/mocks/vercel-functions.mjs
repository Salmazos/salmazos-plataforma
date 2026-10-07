// audit.ts usa waitUntil; aqui só guarda a promise pra o teste esperar (flush) antes de olhar audit_logs.
export function waitUntil(promessa) {
  (globalThis.__PENDENTES__ ??= []).push(promessa);
}
