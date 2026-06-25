import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import AuditLogsPageClient from "@/components/AuditLogsPageClient";

export const dynamic = "force-dynamic";

export interface AuditLog {
  id: string;
  created_at: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  detalhes: Record<string, unknown> | null;
  ip_address: string | null;
}

export default async function AuditLogsPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";

  if (role !== "superuser") redirect("/painel");

  const supabase = createServiceClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return <AuditLogsPageClient logs={(logs as AuditLog[]) ?? []} />;
}
