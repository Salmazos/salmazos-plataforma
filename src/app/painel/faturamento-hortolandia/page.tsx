import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarFaturamentoHortolandia } from "@/lib/faturamentoHortolandiaAuth";
import { obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import { resolverUnidadeUsuario, podeVerUnidade } from "@/lib/unidadeAuth";
import { nomeUnidadeFaturamento } from "@/lib/faturamentoUnidades";
import SemAcessoPainel from "@/components/SemAcessoPainel";
import FaturamentoHortolandiaPageClient, {
  type ContaReceberRow,
  type ContaPagarRow,
} from "@/components/FaturamentoHortolandiaPageClient";

export const dynamic = "force-dynamic";

export default async function FaturamentoHortolandiaPage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string; abrir?: string }>;
}) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarFaturamentoHortolandia(user))) redirect("/painel");
  const ctx = await resolverUnidadeUsuario(user);
  if (!ctx) return <SemAcessoPainel />;

  const svc = createServiceClient();
  const hoje = obterDataHojeBrasil();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  // Faturamento Unidades (decisão do Olver, 24/09): sempre UMA unidade por vez. Ordem pra
  // escolher: ?unidade= da URL; senão a unidade do lançamento do deep-link ?abrir= (popup de
  // vencidas e sino não sabem a unidade); senão a unidade padrão (Hortolândia) pra quem vê
  // todas, ou a própria unidade.
  const { unidade: unidadeParam, abrir } = await searchParams;
  const { data: unidadesTodas } = await svc.from("unidades").select("id, slug, nome").order("nome");
  const unidades = (unidadesTodas ?? []).filter((u) => podeVerUnidade(ctx, u.id));
  let unidadeId = unidades.find((u) => u.id === unidadeParam)?.id ?? null;
  if (!unidadeId && abrir) {
    const { data: contaAberta } = await svc.from("contas_receber_hortolandia").select("unidade_id").eq("id", abrir).maybeSingle();
    unidadeId = unidades.find((u) => u.id === contaAberta?.unidade_id)?.id ?? null;
  }
  if (!unidadeId) {
    unidadeId = ctx.todasUnidades
      ? (unidades.find((u) => u.slug === "monte-mor-hortolandia") ?? unidades[0])?.id ?? ctx.unidadeId
      : ctx.unidadeId;
  }
  const unidadeAtual = unidades.find((u) => u.id === unidadeId);

  const [{ data }, { data: saidas }, { data: imposto }, { data: todosImpostos }] = await Promise.all([
    svc
      .from("contas_receber_hortolandia")
      .select("*, clientes(id, nome)")
      .eq("unidade_id", unidadeId)
      .order("data_vencimento", { ascending: true }),
    svc.from("contas_pagar_hortolandia").select("*").eq("unidade_id", unidadeId).order("data_pagamento", { ascending: false }),
    svc
      .from("faturamento_hortolandia_impostos_mensais")
      .select("ano, mes, percentual, atualizado_em")
      .eq("unidade_id", unidadeId)
      .eq("ano", ano)
      .eq("mes", mes)
      .maybeSingle(),
    // Todos os meses já lançados — pra calcular o Valor Líquido por lançamento na tabela,
    // que mostra lançamentos de vários meses ao mesmo tempo (não só o mês selecionado acima).
    svc.from("faturamento_hortolandia_impostos_mensais").select("ano, mes, percentual").eq("unidade_id", unidadeId),
  ]);

  const impostosPorMesInicial: Record<string, number> = {};
  for (const i of todosImpostos ?? []) {
    impostosPorMesInicial[`${i.ano}-${String(i.mes).padStart(2, "0")}`] = i.percentual;
  }

  const rows: ContaReceberRow[] = (data ?? []).map((r) => ({
    id: r.id,
    clienteId: r.cliente_id,
    clienteNome: (Array.isArray(r.clientes) ? r.clientes[0]?.nome : r.clientes?.nome) ?? "—",
    numeroNf: r.numero_nf,
    valor: r.valor,
    dataVencimento: r.data_vencimento,
    dataPagamento: r.data_pagamento,
    dataEmissaoNf: r.data_emissao_nf,
    status: r.status,
    observacoes: r.observacoes,
    impostoPercentualManual: r.imposto_percentual_manual,
  }));

  const saidasRows: ContaPagarRow[] = (saidas ?? []).map((s) => ({
    id: s.id,
    dataPagamento: s.data_pagamento,
    descricao: s.descricao,
    valor: s.valor,
    responsavel: s.responsavel,
  }));

  return (
    <FaturamentoHortolandiaPageClient
      key={unidadeId}
      unidadeId={unidadeId}
      nomeUnidade={nomeUnidadeFaturamento(unidadeAtual)}
      unidadesOpcoes={unidades.map((u) => ({ id: u.id, nome: nomeUnidadeFaturamento(u) }))}
      somenteLeitura={!ctx.todasUnidades}
      rowsIniciais={rows}
      saidasIniciais={saidasRows}
      anoInicial={ano}
      mesInicial={mes}
      impostoInicial={imposto?.percentual ?? null}
      impostosPorMesInicial={impostosPorMesInicial}
    />
  );
}
