import SemAcessoPainel from "@/components/SemAcessoPainel";
import { createServiceClient } from "@/lib/supabase/server";
import { contextoUnidadeDaSessao } from "@/lib/unidadeAuth";
import VagasPageClient from "@/components/VagasPageClient";
import type { Vaga } from "@/types";

export const dynamic = "force-dynamic";

export default async function VagasPage() {
  const ctx = await contextoUnidadeDaSessao();
  if (!ctx) return <SemAcessoPainel />;

  const supabase = createServiceClient();

  let vagasQuery = supabase
    .from("vagas")
    .select("*, clientes(id, nome)")
    .order("titulo", { ascending: true });
  let solicitacoesQuery = supabase
    .from("solicitacoes_vagas")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente");
  // Pedidos de alteração do cliente aguardando aprovação também contam como pendência no
  // botão "Solicitações" (aparecem na mesma lista — ver GET /api/solicitacoes-vagas).
  let pedidosAlteracaoQuery = supabase
    .from("solicitacao_vaga_alteracoes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  if (!ctx.todasUnidades) {
    vagasQuery = vagasQuery.eq("unidade_id", ctx.unidadeId);
    solicitacoesQuery = solicitacoesQuery.eq("unidade_id", ctx.unidadeId);
    pedidosAlteracaoQuery = pedidosAlteracaoQuery.eq("unidade_id", ctx.unidadeId);
  }

  const [{ data: vagas }, { count: solicitacoesPendentes }, { data: unidades }, { count: pedidosPendentes }] = await Promise.all([
    vagasQuery,
    solicitacoesQuery,
    // Só quem vê todas as unidades escolhe a unidade de vaga sem cliente no formulário.
    // Inclui unidade ainda inativa (SBC), como nas telas de Clientes e Usuários: ela já opera
    // antes da abertura oficial.
    ctx.todasUnidades
      ? supabase.from("unidades").select("id, nome, ativa").order("nome")
      : Promise.resolve({ data: null }),
    pedidosAlteracaoQuery,
  ]);
  const pendingCount = (solicitacoesPendentes ?? 0) + (pedidosPendentes ?? 0);

  return (
    <VagasPageClient
      vagas={(vagas ?? []) as Vaga[]}
      pendingCount={pendingCount}
      unidades={(unidades as { id: string; nome: string; ativa: boolean }[] | null) ?? undefined}
    />
  );
}
