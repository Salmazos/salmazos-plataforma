import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavbarPainel from "@/components/NavbarPainel";

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

  const isSuperuser = user.app_metadata?.role === "superuser";

  return (
    <div className="min-h-screen bg-gray-100">
      <NavbarPainel userEmail={user.email ?? ""} isSuperuser={isSuperuser} />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
