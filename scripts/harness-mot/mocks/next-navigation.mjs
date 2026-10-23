export function redirect(destino) {
  throw new Error(`REDIRECT:${destino}`);
}
export function notFound() {
  throw new Error("NOT_FOUND");
}
// Smoke de tela (react-test-renderer): o roteador só registra as chamadas em globalThis.__ROUTER__.
export function useRouter() {
  const chamadas = (globalThis.__ROUTER__ ??= []);
  return { refresh: () => chamadas.push("refresh"), push: (d) => chamadas.push(`push:${d}`), replace: (d) => chamadas.push(`replace:${d}`), back: () => chamadas.push("back") };
}
