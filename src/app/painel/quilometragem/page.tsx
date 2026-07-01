import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import KmTab from "@/components/KmTab";

export const dynamic = "force-dynamic";

export default async function QuilometragemPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("analistas_perfil")
    .select("id, nivel_acesso")
    .eq("user_id", user.id)
    .single();

  if (!perfil) redirect("/painel");

  const isGestor = perfil.nivel_acesso === "superuser" || perfil.nivel_acesso === "diretoria";

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Quilometragem</h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Registre e acompanhe seus deslocamentos e reembolsos de KM</p>
      </div>
      <KmTab analistaId={perfil.id} isGestor={isGestor} />
    </div>
  );
}
