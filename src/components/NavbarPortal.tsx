"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userEmail: string;
}

export default function NavbarPortal({ userEmail }: Props) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/portal/login");
  };

  return (
    <header style={{ backgroundColor: "#000", borderBottom: "3px solid #FFD700" }}>
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Salmazos_logo_Amarelo.png"
            alt="Salmazos RH"
            className="h-10 w-auto object-contain"
          />
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full hidden sm:inline"
            style={{ backgroundColor: "#FFD700", color: "#000" }}
          >
            Portal do Cliente
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-white/50 text-sm hidden sm:block">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-white/80 hover:text-white text-sm border border-white/20 hover:border-white/50 rounded-lg px-3 py-1.5 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
