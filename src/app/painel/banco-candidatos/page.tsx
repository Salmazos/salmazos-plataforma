import { createServiceClient } from "@/lib/supabase/server";
import BancoCandidatosClient from "@/components/BancoCandidatosClient";
import type { CandidatoRow } from "@/components/BancoCandidatosClient";

export const dynamic = "force-dynamic";

export default async function BancoCandidatosPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("candidatos")
    .select("id, nome_completo, idade, cargo_pretendido, cidade, triagem_score, created_at")
    .order("created_at", { ascending: false });

  return <BancoCandidatosClient candidatos={(data ?? []) as CandidatoRow[]} />;
}
