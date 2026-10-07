export function redirect(destino) {
  throw new Error(`REDIRECT:${destino}`);
}
export function notFound() {
  throw new Error("NOT_FOUND");
}
