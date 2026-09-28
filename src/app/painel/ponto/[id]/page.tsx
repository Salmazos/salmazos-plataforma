import type { ComponentProps } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarPonto } from "@/lib/pontoAuth";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import PontoFechamentoDetalheClient from "@/components/PontoFechamentoDetalheClient";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import { podeVerUnidade } from "@/lib/unidadeAuth";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function PontoFechamentoDetalhePage({ params }: Params) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarPonto(user))) redirect("/painel");

  const role = user.app_metadata?.role ?? "analista";
  const podeExcluir = PAPEIS_FULL_ACCESS.includes(role);

  const { id } = await params;
  const svc = createServiceClient();

  const { data: fechamento } = await svc
    .from("ponto_fechamentos")
    .select("id, cliente_id, unidade_id, periodo_inicio, periodo_fim, status, arquivo_original_nome, criado_em, clientes(nome)")
    .eq("id", id)
    .maybeSingle();
  // Fechamento de outra unidade responde 404, como no resto do RH por unidade.
  const ctx = await contextoRH(user);
  if (!fechamento || !ctx || !podeVerUnidade(ctx, fechamento.unidade_id)) notFound();

  const { data: funcionariosPlanilha } = await svc
    .from("ponto_funcionarios")
    .select("id, funcionario_id, nome_planilha, ezepoint_codigo, cargo, data_admissao, totais, status_vinculo")
    .eq("fechamento_id", id)
    .order("nome_planilha");

  const idsPlanilha = (funcionariosPlanilha ?? []).map((f) => f.id);
  const { data: dias } = idsPlanilha.length
    ? await svc
        .from("ponto_dias")
        .select("id, ponto_funcionario_id, data, dia_semana, marcacoes, nota_original, campos, fora_padrao, tipo_ocorrencia, justificativa_rh, status_decisao")
        .in("ponto_funcionario_id", idsPlanilha)
        .order("data")
    : { data: [] };

  type DiaLinha = NonNullable<typeof dias>[number];
  const diasPorFuncionario = new Map<string, DiaLinha[]>();
  for (const d of dias ?? []) {
    const lista = diasPorFuncionario.get(d.ponto_funcionario_id) ?? [];
    lista.push(d);
    diasPorFuncionario.set(d.ponto_funcionario_id, lista);
  }

  const funcionariosComDias = (funcionariosPlanilha ?? []).map((f) => ({
    ...f,
    dias: diasPorFuncionario.get(f.id) ?? [],
  }));

  // Lista de funcionários ativos do MESMO cliente do fechamento, pra resolver manualmente
  // uma linha "pendente_vinculo" (dropdown na tela) — nunca oferece funcionário de outro
  // cliente, mesmo que o RH tente forçar (a rota de vincular também trava isso no backend).
  const { data: funcionariosDoCliente } = await svc
    .from("funcionarios")
    .select("id, nome_completo")
    .eq("cliente_id", fechamento.cliente_id)
    .eq("status", "ativo")
    .order("nome_completo");

  return (
    <PontoFechamentoDetalheClient
      // clientes(nome) é many-to-one (objeto em runtime); sem tipos gerados do banco o
      // supabase-js tipa todo embed como lista.
      fechamento={fechamento as unknown as ComponentProps<typeof PontoFechamentoDetalheClient>["fechamento"]}
      funcionarios={funcionariosComDias}
      funcionariosDoCliente={funcionariosDoCliente ?? []}
      podeExcluir={podeExcluir}
    />
  );
}
