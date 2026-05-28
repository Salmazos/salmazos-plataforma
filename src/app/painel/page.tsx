import { createServiceClient } from "@/lib/supabase/server";
import KanbanBoard from "@/components/KanbanBoard";
import type { Candidato } from "@/types";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="text-red-600 text-sm p-4 bg-red-50 rounded-lg">
        Erro ao carregar candidatos: {error.message}
      </div>
    );
  }

  return <KanbanBoard candidatos={(data as Candidato[]) ?? []} />;
}
