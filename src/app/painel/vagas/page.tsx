import { createServiceClient } from "@/lib/supabase/server";
import VagasPageClient from "@/components/VagasPageClient";
import type { Vaga } from "@/types";

export const dynamic = "force-dynamic";

export default async function VagasPage() {
  const supabase = createServiceClient();

  const [{ data: vagas }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("vagas")
      .select("*, clientes(id, nome)")
      .order("titulo", { ascending: true }),
    supabase
      .from("solicitacoes_vagas")
      .select("*", { count: "exact", head: true })
      .eq("status", "pendente"),
  ]);

  return <VagasPageClient vagas={(vagas ?? []) as Vaga[]} pendingCount={pendingCount ?? 0} />;
}
