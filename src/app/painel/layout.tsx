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

  return (
    <div className="min-h-screen bg-gray-100">
      <NavbarPainel userEmail={user.email ?? ""} />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
