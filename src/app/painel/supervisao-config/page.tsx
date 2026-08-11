import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PAPEIS_FULL_ACCESS } from "@/lib/fullAccessAuth";
import SupervisaoConfigClient from "@/components/SupervisaoConfigClient";

export const dynamic = "force-dynamic";

export default async function SupervisaoConfigPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  if (!PAPEIS_FULL_ACCESS.includes(role)) redirect("/painel");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Configuração de Supervisão</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
          Defina quais clientes entram no programa de supervisão, a frequência e o supervisor responsável
        </p>
      </div>
      <SupervisaoConfigClient />
    </div>
  );
}
