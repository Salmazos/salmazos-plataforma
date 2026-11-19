import { redirect } from "next/navigation";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";

// Quem é o cliente da sessão do portal. É a ÚNICA fonte do cliente_id nas páginas e rotas novas do portal: nada vem da URL nem do corpo da requisição.
// O layout do portal já faz esta checagem, mas ele não protege a navegação (cada página precisa repetir), então a página chama esta função.
//  - sem sessão do portal (inclui usuário do painel, que usa outro cookie): /portal/login
//  - sessão sem vínculo em cliente_usuarios: /portal/login
//  - vínculo ambíguo (2 clientes): o .single() falha e cai no caso acima (não mostra nada)
//  - cliente inativo: /portal/login?suspenso=1
export type ClienteDoPortal =
  | { ok: true; clienteId: string; service: ReturnType<typeof createServiceClient> }
  | { ok: false; motivo: "sem_sessao" | "sem_vinculo" | "suspenso" };

// Versão sem redirect, para as rotas de API (que respondem 401/403 em vez de redirecionar).
export async function resolverClienteDoPortal(): Promise<ClienteDoPortal> {
  const supabase = await createPortalClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: "sem_sessao" };

  const service = createServiceClient();
  const { data: clienteUsuario } = await service.from("cliente_usuarios").select("cliente_id").eq("user_id", user.id).single();
  if (!clienteUsuario) return { ok: false, motivo: "sem_vinculo" };

  const { data: cliente } = await service.from("clientes").select("ativo").eq("id", clienteUsuario.cliente_id).single();
  if (!cliente?.ativo) return { ok: false, motivo: "suspenso" };

  return { ok: true, clienteId: clienteUsuario.cliente_id as string, service };
}

export async function obterClienteDoPortal() {
  const r = await resolverClienteDoPortal();
  if (!r.ok) redirect(r.motivo === "suspenso" ? "/portal/login?suspenso=1" : "/portal/login");
  return { clienteId: r.clienteId, service: r.service };
}
