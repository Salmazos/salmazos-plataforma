import { createServiceClient } from "@/lib/supabase/server";
import VagasPageClient from "@/components/VagasPageClient";
import type { Vaga } from "@/types";

export const dynamic = "force-dynamic";

export default async function VagasPage() {
  const supabase = createServiceClient();
  const { data: vagas } = await supabase
    .from("vagas")
    .select("*, clientes(id, nome)")
    .order("titulo", { ascending: true });

  return <VagasPageClient vagas={(vagas ?? []) as Vaga[]} />;
}
