import { createServiceClient } from "@/lib/supabase/server";
import BancoCandidatosClient from "@/components/BancoCandidatosClient";
import type { CandidatoRow } from "@/components/BancoCandidatosClient";

export const dynamic = "force-dynamic";

export default async function BancoCandidatosPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("candidatos")
    .select("id, nome_completo, idade, cargo_pretendido, cidade, triagem_score, triagem_label, triagem_resumo, melhor_match_score, melhor_match_vaga_titulo, juridico_tem_trabalhista, juridico_total_processos, juridico_consultado_em, created_at")
    .order("created_at", { ascending: false });

  return <BancoCandidatosClient candidatos={(data ?? []) as CandidatoRow[]} />;
}
