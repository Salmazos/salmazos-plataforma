import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MeuPerfilClient from "@/components/MeuPerfilClient";

export const dynamic = "force-dynamic";

export default async function MeuPerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("analistas_perfil")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return (
    <MeuPerfilClient
      perfil={perfil}
      userEmail={user.email ?? ""}
      userId={user.id}
    />
  );
}
