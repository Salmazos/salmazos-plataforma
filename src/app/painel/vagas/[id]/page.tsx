import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import VagaDetalheClient from "@/components/VagaDetalheClient";
import type { Vaga, CandidatoVaga } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VagaDetalhePage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: vaga }, { data: candidatosVaga }] = await Promise.all([
    supabase
      .from("vagas")
      .select("*, clientes(id, nome)")
      .eq("id", id)
      .single(),
    supabase
      .from("candidatos_vagas")
      .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
      .eq("vaga_id", id)
      .order("match_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!vaga) notFound();

  return (
    <VagaDetalheClient
      vaga={vaga as Vaga}
      candidatosVaga={(candidatosVaga ?? []) as CandidatoVaga[]}
    />
  );
}
