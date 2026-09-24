import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import FaturamentoRSPageClient from "@/components/FaturamentoRSPageClient";
import { podeAcessarFaturamentoRs } from "@/lib/faturamentoRsAuth";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import { obterReceitaMes } from "@/lib/faturamentoRS";
import { resolverFiltroUnidade, resolverUnidadeUsuario } from "@/lib/unidadeAuth";
import SemAcessoPainel from "@/components/SemAcessoPainel";
import SeletorUnidade from "@/components/SeletorUnidade";

export const dynamic = "force-dynamic";

export default async function FaturamentoRSPage({ searchParams }: { searchParams: Promise<{ unidade?: string }> }) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarFaturamentoRs(user))) redirect("/painel");
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return <SemAcessoPainel />;

  const hoje = obterDataHojeBrasil();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const svc = createServiceClient();
  const { unidade: unidadeParam } = await searchParams;
  const unidadeId = await resolverFiltroUnidade(ctx, unidadeParam);
  const [dadosIniciais, { data: unidades }] = await Promise.all([
    obterReceitaMes(svc, ano, mes, unidadeId),
    svc.from("unidades").select("id, nome").order("nome"),
  ]);

  return (
    <>
      {ctx.todasUnidades && (
        <div className="max-w-6xl mx-auto">
          <SeletorUnidade unidades={unidades ?? []} unidadeSel={unidadeId} basePath="/painel/faturamento-rs" />
        </div>
      )}
      <FaturamentoRSPageClient
        anoInicial={ano}
        mesInicial={mes}
        dadosIniciais={dadosIniciais}
        unidadeId={unidadeId}
        nomeUnidade={(unidades ?? []).find((u) => u.id === unidadeId)?.nome ?? null}
      />
    </>
  );
}
