import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface LinhaSolicitacao {
  cliente_id?: string | null;
  link_id?: string | null;
  origem?: string | null;
}

// Acrescenta às solicitações do link público o que o cartão precisa para o cadastro de cliente: o cliente já vinculado (para mostrar "Cliente: nome" no
// lugar dos botões) e quem gerou o link (sugestão de responsável comercial). Duas consultas para a lista inteira, nunca uma por linha. Qualquer erro
// só deixa os campos vazios: o cartão continua funcionando sem eles.
export async function anexarClienteVinculado<T extends LinhaSolicitacao>(
  svc: ServiceClient,
  linhas: T[]
): Promise<(T & { cliente_vinculado: { id: string; nome: string } | null; link_criado_por_nome: string | null })[]> {
  const clienteIds = [...new Set(linhas.map((l) => l.cliente_id).filter((v): v is string => !!v))];
  const linkIds = [...new Set(linhas.filter((l) => l.origem === "link_publico").map((l) => l.link_id).filter((v): v is string => !!v))];

  const clientes = new Map<string, string>();
  if (clienteIds.length > 0) {
    const { data, error } = await svc.from("clientes").select("id, nome").in("id", clienteIds);
    if (error) console.error("[solicitacaoClienteVinculado] Erro ao ler os clientes vinculados:", error.code ?? "sem código");
    for (const c of data ?? []) clientes.set(c.id as string, c.nome as string);
  }
  const criadores = new Map<string, string | null>();
  if (linkIds.length > 0) {
    const { data, error } = await svc.from("solicitacao_vaga_links").select("id, criado_por_nome").in("id", linkIds);
    if (error) console.error("[solicitacaoClienteVinculado] Erro ao ler quem gerou o link:", error.code ?? "sem código");
    for (const l of data ?? []) criadores.set(l.id as string, (l.criado_por_nome as string | null) ?? null);
  }

  return linhas.map((l) => ({
    ...l,
    cliente_vinculado: l.cliente_id && clientes.has(l.cliente_id) ? { id: l.cliente_id, nome: clientes.get(l.cliente_id)! } : null,
    link_criado_por_nome: l.link_id ? criadores.get(l.link_id) ?? null : null,
  }));
}
