import { notFound, redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { podeAcessarFuncionarios } from "@/lib/funcionariosAuth";
import { contextoRH } from "@/lib/rhUnidadeAuth";
import { carregarGestaoPessoas, listarClientesComAtivos } from "@/lib/gestaoPessoas";
import { formatarDataISO, obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import SemAcessoPainel from "@/components/SemAcessoPainel";
import GestaoPessoasClient from "@/components/GestaoPessoasClient";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ cliente?: string }>;
}

// Gestão de Pessoas (RH): funcionários ATIVOS de uma empresa, calculado na hora a cada abertura. O gate é o mesmo do módulo Funcionários
// (podeAcessarFuncionarios) e a unidade é recortada aqui no servidor (contextoRH): o navegador só informa QUAL empresa, nunca o que pode ver.
export default async function GestaoPessoasPage({ searchParams }: Props) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/login");
  if (!(await podeAcessarFuncionarios(user))) redirect("/painel");
  // RH por unidade (decisão do Olver, 24/09): supervisor só vê a própria unidade; sócios, todas.
  const ctxRH = await contextoRH(user);
  if (!ctxRH) return <SemAcessoPainel />;
  const unidadeRH = ctxRH.todasUnidades ? null : ctxRH.unidadeId;

  const svc = createServiceClient();
  const clientes = await listarClientesComAtivos(svc, { unidadeRH });

  const { cliente } = await searchParams;
  let dados = null;
  if (cliente) {
    // cliente_id inválido, inexistente ou de outra unidade: 404 (não confirma que o id existe).
    dados = await carregarGestaoPessoas(svc, { clienteId: cliente, unidadeRH, hojeISO: formatarDataISO(obterDataHojeBrasil()) });
    if (!dados) notFound();
  }

  // key = empresa: trocar de empresa remonta a tela e o seletor de mês dos aniversariantes volta para o mês corrente.
  return <GestaoPessoasClient key={dados?.cliente.id ?? "nenhuma"} clientes={clientes} selecionadoId={dados?.cliente.id ?? null} dados={dados} />;
}
