import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import RelatoriosPageClient from "@/components/RelatoriosPageClient";
import { ETAPAS_KANBAN_VISIVEIS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role === "analista") redirect("/painel");

  const supabase = createServiceClient();

  const [{ data: candidatos }, { data: encaminhamentos }, { data: clientes }, { data: vagas }, { data: candidatosVagas }] =
    await Promise.all([
      supabase
        .from("candidatos")
        .select("id, responsavel, status, created_at"),
      supabase
        .from("encaminhamentos")
        .select("id, candidato_id, cliente_id, status, created_at, updated_at"),
      supabase
        .from("clientes")
        .select("id, nome, responsavel_comercial, ativo")
        .order("nome"),
      supabase
        .from("vagas")
        .select("id, titulo, status, data_abertura, data_fechamento, cliente_id, tipo_servico, responsavel, clientes(nome)")
        .order("data_fechamento", { ascending: false, nullsFirst: false }),
      // Fonte de verdade da etapa do candidato — não candidatos.etapa_kanban, que
      // não é atualizada de forma confiável (mesmo critério do Kanban/Dashboard).
      supabase
        .from("candidatos_vagas")
        .select("candidato_id, etapa")
        .in("etapa", ETAPAS_KANBAN_VISIVEIS),
    ]);

  return (
    <RelatoriosPageClient
      candidatos={candidatos ?? []}
      encaminhamentos={encaminhamentos ?? []}
      clientes={clientes ?? []}
      vagas={vagas ?? []}
      candidatosVagas={candidatosVagas ?? []}
    />
  );
}
