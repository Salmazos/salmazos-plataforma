import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavbarPainel from "@/components/NavbarPainel";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = user.app_metadata?.role ?? "analista";
  const isFullAccess = ["superuser", "diretoria"].includes(role);
  const isSupervisorOrAbove = ["superuser", "diretoria", "supervisor"].includes(role);

  const { data: perfil } = await supabase
    .from("analistas_perfil")
    .select("id, nome_completo, cargo, avatar_url, nivel_acesso")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-100">
      <NavbarPainel
        userEmail={user.email ?? ""}
        userName={perfil?.nome_completo ?? null}
        userCargo={perfil?.cargo ?? null}
        userAvatar={perfil?.avatar_url ?? null}
        role={role}
        isFullAccess={isFullAccess}
        isSupervisorOrAbove={isSupervisorOrAbove}
      />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
