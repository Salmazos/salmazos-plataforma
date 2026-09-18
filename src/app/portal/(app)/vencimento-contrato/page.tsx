import { redirect } from "next/navigation";
import Link from "next/link";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import { calcularVencimentoContratoMot } from "@/lib/contratoMotStatus";
import VencimentoContratoPortalListClient, {
  type VencimentoContratoPortalRow,
} from "@/components/VencimentoContratoPortalListClient";

export const dynamic = "force-dynamic";

export default async function PortalVencimentoContratoPage() {
  const supabase = await createPortalClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const service = createServiceClient();

  const { data: clienteUsuario } = await service
    .from("cliente_usuarios")
    .select("cliente_id")
    .eq("user_id", user.id)
    .single();
  if (!clienteUsuario) redirect("/portal/login");

  // Só MOT ativo entra nesse relatório — mesma regra do lado do painel (só essa
  // modalidade tem o limite legal de 90/180/270 dias, Lei 6.019/74). Cliente já vê só os
  // próprios funcionários por construção do filtro cliente_id.
  const { data: funcionarios } = await service
    .from("funcionarios")
    .select("id, nome_completo, data_admissao")
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("tipo_servico", "mao_obra_temporaria")
    .eq("status", "ativo")
    .not("data_admissao", "is", null);

  const linhas: VencimentoContratoPortalRow[] = (funcionarios ?? [])
    .map((f) => {
      const v = calcularVencimentoContratoMot(f.data_admissao as string);
      return {
        id: f.id,
        nomeCompleto: f.nome_completo,
        dataAdmissao: f.data_admissao as string,
        ...v,
      };
    })
    .sort((a, b) => a.diasParaProximoVencimento - b.diasParaProximoVencimento);

  return (
    <div>
      <Link
        href="/portal"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50 mb-4"
      >
        <span className="text-base font-bold">←</span>
        Voltar
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vencimento de Contrato</h1>
        <p className="text-gray-500 text-sm mt-1">
          Prazos de renovação de 90, 180 e 270 dias (Lei 6.019/74) dos seus funcionários MOT ativos.
        </p>
      </div>

      <VencimentoContratoPortalListClient linhas={linhas} />
    </div>
  );
}
