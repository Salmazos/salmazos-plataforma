import { redirect } from "next/navigation";
import { createPortalClient, createServiceClient } from "@/lib/supabase/server";
import PortalAgendaClient, { type EventoAgenda } from "@/components/PortalAgendaClient";

export const dynamic = "force-dynamic";

export default async function PortalAgendaPage() {
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

  // Só entrevistas com data já confirmada (status "aguardando" normal) — o que
  // ainda está "aguardando_agendamento_cliente" não tem data pra plotar aqui.
  const { data: encRows } = await service
    .from("encaminhamentos")
    .select("id, data_entrevista, candidatos(nome_completo, cargo_pretendido), vagas(titulo)")
    .eq("cliente_id", clienteUsuario.cliente_id)
    .eq("status", "aguardando")
    .not("data_entrevista", "is", null)
    .order("data_entrevista", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventos: EventoAgenda[] = ((encRows ?? []) as any[]).map((e) => ({
    id: e.id,
    data_entrevista: e.data_entrevista,
    candidato_nome: e.candidatos?.nome_completo ?? "Candidato",
    cargo_pretendido: e.candidatos?.cargo_pretendido ?? null,
    vaga_titulo: e.vagas?.titulo ?? null,
  }));

  return <PortalAgendaClient eventos={eventos} />;
}
