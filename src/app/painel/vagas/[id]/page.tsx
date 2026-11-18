import SemAcessoPainel from "@/components/SemAcessoPainel";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import VagaDetalheClient from "@/components/VagaDetalheClient";
import { ETAPAS_SAIDA_VAGA } from "@/lib/constants";
import { contextoUnidadeDaSessao, podeVerUnidade } from "@/lib/unidadeAuth";
import { COLUNAS_SOLICITACAO_ORIGINAL, solicitacaoVisivel, type SolicitacaoOriginalDaVaga } from "@/lib/solicitacaoOriginalDaVaga";
import type { Vaga, CandidatoVaga } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VagaDetalhePage({ params }: Props) {
  const { id } = await params;
  const ctx = await contextoUnidadeDaSessao();
  if (!ctx) return <SemAcessoPainel />;
  const supabase = createServiceClient();

  const [{ data: vaga }, { data: candidatosVaga }, { data: solicitacao }] = await Promise.all([
    supabase
      .from("vagas")
      .select("*, clientes(id, nome, processo_simplificado)")
      .eq("id", id)
      .single(),
    supabase
      .from("candidatos_vagas")
      .select("*, candidatos(id, nome_completo, etapa_kanban, responsavel, cargo_pretendido)")
      .eq("vaga_id", id)
      .not("etapa", "in", `(${ETAPAS_SAIDA_VAGA.join(",")})`)
      .order("match_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // Solicitação do cliente que originou a vaga (só leitura, uso interno). Lista de colunas explícita; falha ou ausência = sem bloco.
    supabase
      .from("solicitacoes_vagas")
      .select(COLUNAS_SOLICITACAO_ORIGINAL)
      .eq("vaga_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  // Vaga de outra unidade responde igual a vaga inexistente (não confirma que o id existe).
  if (!vaga || !podeVerUnidade(ctx, vaga.unidade_id)) notFound();

  return (
    <VagaDetalheClient
      vaga={vaga as Vaga}
      candidatosVaga={(candidatosVaga ?? []) as CandidatoVaga[]}
      solicitacaoOriginal={solicitacaoVisivel(solicitacao as unknown as SolicitacaoOriginalDaVaga | null, (u) => podeVerUnidade(ctx, u))}
    />
  );
}
