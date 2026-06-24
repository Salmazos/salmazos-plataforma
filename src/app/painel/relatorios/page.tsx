import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import RelatoriosPageClient from "@/components/RelatoriosPageClient";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";
  if (role === "analista") redirect("/painel");

  const supabase = createServiceClient();

  const [{ data: candidatos }, { data: encaminhamentos }, { data: clientes }, { data: vagas }] =
    await Promise.all([
      supabase
        .from("candidatos")
        .select("id, responsavel, etapa_kanban, status, created_at"),
      supabase
        .from("encaminhamentos")
        .select("id, candidato_id, cliente_id, status, created_at, updated_at"),
      supabase
        .from("clientes")
        .select("id, nome, responsavel_comercial, ativo")
        .order("nome"),
      supabase
        .from("vagas")
        .select("id, titulo, status, data_abertura, data_fechamento, cliente_id, clientes(nome)")
        .order("data_fechamento", { ascending: false, nullsFirst: false }),
    ]);

  return (
    <RelatoriosPageClient
      candidatos={candidatos ?? []}
      encaminhamentos={encaminhamentos ?? []}
      clientes={clientes ?? []}
      vagas={vagas ?? []}
    />
  );
}
