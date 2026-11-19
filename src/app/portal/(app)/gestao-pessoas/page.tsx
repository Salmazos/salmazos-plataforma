import { notFound } from "next/navigation";
import { obterClienteDoPortal } from "@/lib/portalCliente";
import { carregarGestaoPessoas, paraPortal } from "@/lib/gestaoPessoas";
import { formatarDataISO, obterDataHojeBrasil } from "@/lib/dataHojeBrasil";
import GestaoPessoasClient from "@/components/GestaoPessoasClient";

export const dynamic = "force-dynamic";

// Gestão de Pessoas do cliente: o MESMO quadro do RH, só da empresa da sessão. Esta página não lê nada da URL: o cliente_id vem só de
// obterClienteDoPortal(). O navegador recebe o quadro já sem o id do cliente (paraPortal) e sem nenhum id de funcionário.
export default async function PortalGestaoPessoasPage() {
  const { clienteId, service } = await obterClienteDoPortal();
  const dados = await carregarGestaoPessoas(service, { clienteId, unidadeRH: null, hojeISO: formatarDataISO(obterDataHojeBrasil()) });
  if (!dados) notFound();
  return <GestaoPessoasClient modo="portal" clientes={[]} selecionadoId={null} dados={paraPortal(dados)} />;
}
