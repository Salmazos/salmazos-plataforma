import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import ClientesPageClient from "@/components/ClientesPageClient";
import type { Cliente } from "@/types";
import { podeAcessarClientes } from "@/lib/comercialAuth";
import { resolverUnidadeUsuario } from "@/lib/unidadeAuth";

export const dynamic = "force-dynamic";

interface ClienteComCount extends Cliente {
  total_encaminhamentos: number;
}

export default async function ClientesPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarClientes(user))) redirect("/painel");

  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) redirect("/painel");

  const supabase = createServiceClient();

  let clientesQuery = supabase.from("clientes").select("*").order("nome");
  if (!ctx.todasUnidades) clientesQuery = clientesQuery.eq("unidade_id", ctx.unidadeId);

  const [{ data: clientes }, { data: counts }, { data: unidades }] = await Promise.all([
    clientesQuery,
    supabase.from("encaminhamentos").select("cliente_id"),
    // Só quem vê todas as unidades escolhe/enxerga a unidade do cliente na tela.
    ctx.todasUnidades
      ? supabase.from("unidades").select("id, nome, ativa").order("nome")
      : Promise.resolve({ data: null }),
  ]);

  const countMap = new Map<string, number>();
  (counts ?? []).forEach((e: { cliente_id: string }) => {
    countMap.set(e.cliente_id, (countMap.get(e.cliente_id) ?? 0) + 1);
  });

  const clientesComCount: ClienteComCount[] = (clientes ?? []).map((c: Cliente) => ({
    ...c,
    total_encaminhamentos: countMap.get(c.id) ?? 0,
  }));

  return (
    <ClientesPageClient
      clientes={clientesComCount}
      unidades={(unidades as { id: string; nome: string; ativa: boolean }[] | null) ?? undefined}
    />
  );
}
