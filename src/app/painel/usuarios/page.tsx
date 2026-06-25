import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import UsuariosPageClient from "@/components/UsuariosPageClient";

export const dynamic = "force-dynamic";

export interface AnalistaPerfil {
  id: string;
  user_id: string;
  nome_completo: string;
  email: string;
  cargo: string | null;
  departamento: string | null;
  nivel_acesso: string | null;
  avatar_url: string | null;
  ativo: boolean;
  updated_at: string | null;
  created_at: string | null;
}

export default async function UsuariosPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = user?.app_metadata?.role ?? "analista";

  if (role !== "superuser") redirect("/painel");

  const supabase = createServiceClient();
  const { data: analistas } = await supabase
    .from("analistas_perfil")
    .select("*")
    .order("nome_completo");

  return <UsuariosPageClient analistas={(analistas as AnalistaPerfil[]) ?? []} />;
}
