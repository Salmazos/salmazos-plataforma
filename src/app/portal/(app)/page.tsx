import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import PortalClienteClient, { type EncaminhamentoPortal } from "@/components/PortalClienteClient";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const supabase = await createClient();
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

  const clienteId = clienteUsuario.cliente_id;

  const [{ data: cliente }, { data: encRows }] = await Promise.all([
    service
      .from("clientes")
      .select("id, nome, contato_nome")
      .eq("id", clienteId)
      .single(),
    service
      .from("encaminhamentos")
      .select(
        "id, status, data_entrevista, feedback_cliente, avaliado_em, created_at, candidatos(id, nome_completo, cargo_pretendido, cidade, estado, habilidades)"
      )
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encaminhamentos: EncaminhamentoPortal[] = (encRows ?? []).map((e: any) => ({
    id: e.id,
    status: e.status,
    data_entrevista: e.data_entrevista,
    feedback_cliente: e.feedback_cliente ?? undefined,
    avaliado_em: e.avaliado_em ?? undefined,
    candidato: e.candidatos,
  }));

  const nomeCliente = cliente?.contato_nome || cliente?.nome || "Cliente";

  return (
    <PortalClienteClient
      nomeCliente={nomeCliente}
      encaminhamentos={encaminhamentos}
    />
  );
}
