import { criarClienteServico } from "../memdb.mjs";

const db = () => globalThis.__DB__;

function clienteAnon(chave) {
  return { auth: { getUser: async () => ({ data: { user: db()[chave] ?? null }, error: null }) } };
}

export async function createClient() {
  return clienteAnon("usuario");
}
export async function createPortalClient() {
  return clienteAnon("usuarioPortal");
}
export function createServiceClient() {
  return criarClienteServico(db());
}
