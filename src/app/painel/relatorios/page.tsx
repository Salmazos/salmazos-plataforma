import { createServiceClient } from "@/lib/supabase/server";
import RelatoriosPageClient from "@/components/RelatoriosPageClient";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const supabase = createServiceClient();

  const [{ data: candidatos }, { data: encaminhamentos }] = await Promise.all([
    supabase
      .from("candidatos")
      .select("id, responsavel, etapa_kanban, status, created_at"),
    supabase
      .from("encaminhamentos")
      .select("id, candidato_id, status, updated_at"),
  ]);

  return (
    <RelatoriosPageClient
      candidatos={candidatos ?? []}
      encaminhamentos={encaminhamentos ?? []}
    />
  );
}
