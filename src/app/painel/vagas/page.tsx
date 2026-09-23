import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { contextoUnidadeDaSessao } from "@/lib/unidadeAuth";
import VagasPageClient from "@/components/VagasPageClient";
import type { Vaga } from "@/types";

export const dynamic = "force-dynamic";

export default async function VagasPage() {
  const ctx = await contextoUnidadeDaSessao();
  if (!ctx) notFound();

  const supabase = createServiceClient();

  let vagasQuery = supabase
    .from("vagas")
    .select("*, clientes(id, nome)")
    .order("titulo", { ascending: true });
  let solicitacoesQuery = supabase
    .from("solicitacoes_vagas")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente");
  if (!ctx.todasUnidades) {
    vagasQuery = vagasQuery.eq("unidade_id", ctx.unidadeId);
    solicitacoesQuery = solicitacoesQuery.eq("unidade_id", ctx.unidadeId);
  }

  const [{ data: vagas }, { count: pendingCount }] = await Promise.all([vagasQuery, solicitacoesQuery]);

  return <VagasPageClient vagas={(vagas ?? []) as Vaga[]} pendingCount={pendingCount ?? 0} />;
}
