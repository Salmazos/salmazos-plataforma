import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AniversariantesPageClient from "@/components/AniversariantesPageClient";

export const dynamic = "force-dynamic";

export default async function AniversariosPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) redirect("/painel");

  return <AniversariantesPageClient />;
}
