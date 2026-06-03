import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import NavbarPortal from "@/components/NavbarPortal";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
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

  return (
    <div className="min-h-screen bg-gray-50">
      <NavbarPortal userEmail={user.email ?? ""} />
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
