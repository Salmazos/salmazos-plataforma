import { createServiceClient } from "@/lib/supabase/server";
import ClientesPageClient from "@/components/ClientesPageClient";
import type { Cliente } from "@/types";

export const dynamic = "force-dynamic";

interface ClienteComCount extends Cliente {
  total_encaminhamentos: number;
}

export default async function ClientesPage() {
  const supabase = createServiceClient();

  const [{ data: clientes }, { data: counts }] = await Promise.all([
    supabase.from("clientes").select("*").order("nome"),
    supabase.from("encaminhamentos").select("cliente_id"),
  ]);

  const countMap = new Map<string, number>();
  (counts ?? []).forEach((e: { cliente_id: string }) => {
    countMap.set(e.cliente_id, (countMap.get(e.cliente_id) ?? 0) + 1);
  });

  const clientesComCount: ClienteComCount[] = (clientes ?? []).map((c: Cliente) => ({
    ...c,
    total_encaminhamentos: countMap.get(c.id) ?? 0,
  }));

  return <ClientesPageClient clientes={clientesComCount} />;
}
