import { createServiceClient } from "@/lib/supabase/server";
import { montarDestinatariosEmailCliente } from "@/lib/avisoClienteRegras";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Quem recebe um e-mail ao cliente: o e-mail de LOGIN de cada usuário do portal do cliente
// (cliente_usuarios -> auth.users), um por pessoa. Cliente sem usuário no portal, ou qualquer erro de
// leitura, cai no clientes.contato_email (comportamento anterior): o cliente nunca fica sem e-mail por
// causa desta troca e a leitura nunca bloqueia o envio. NUNCA lança. `clienteId` vem sempre do servidor
// (linha do banco), nunca do corpo da requisição.
// `contatoEmail`: quem já leu clientes.contato_email passa o valor (null = cliente sem e-mail) e evita a
// consulta; omitido, ela só roda quando faz falta (sem usuário no portal ou erro).
export async function destinatariosEmailCliente(
  clienteId: string | null | undefined,
  svc: ServiceClient = createServiceClient(),
  opcoes: { contatoEmail?: string | null } = {}
): Promise<string[]> {
  if (!clienteId) return [];
  let emailsLogin: (string | null | undefined)[] = [];
  let erro = false;
  try {
    const { data: vinculos, error } = await svc.from("cliente_usuarios").select("user_id").eq("cliente_id", clienteId);
    if (error) throw new Error(error.message);
    const resultados = await Promise.all((vinculos ?? []).map((v) => svc.auth.admin.getUserById(v.user_id as string)));
    for (const r of resultados) {
      if (r.error) throw new Error(r.error.message);
      emailsLogin.push(r.data?.user?.email);
    }
  } catch (err) {
    console.error(`[destinatariosEmailCliente] Erro ao ler os usuários do portal (cliente_id=${clienteId}); usando contato_email:`, err);
    erro = true;
    emailsLogin = [];
  }

  // Com e-mail de login em mãos, o contato nem é consultado.
  const precisaContato = erro || emailsLogin.every((e) => !e?.trim());
  let contatoEmail: string | null | undefined = opcoes.contatoEmail;
  if (precisaContato && contatoEmail === undefined) {
    try {
      const { data, error: erroContato } = await svc.from("clientes").select("contato_email").eq("id", clienteId).maybeSingle();
      if (erroContato) console.error(`[destinatariosEmailCliente] Erro ao ler o contato_email (cliente_id=${clienteId}):`, erroContato.message);
      contatoEmail = (data as { contato_email?: string | null } | null)?.contato_email ?? null;
    } catch (err) {
      console.error(`[destinatariosEmailCliente] Erro inesperado ao ler o contato_email (cliente_id=${clienteId}):`, err);
      contatoEmail = null;
    }
  }
  return montarDestinatariosEmailCliente({ emailsLogin, contatoEmail, erro });
}
