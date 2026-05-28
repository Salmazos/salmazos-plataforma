"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userEmail: string;
}

export default function NavbarPainel({ userEmail }: Props) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="bg-black shadow-md">
      <div className="max-w-screen-xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/painel" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH & Serviços" className="h-[48px] w-auto object-contain" />
        </Link>

        <div className="flex items-center gap-4">
          <span className="text-[#FFB800]/60 text-sm hidden sm:block">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-[#FFB800]/80 hover:text-[#FFB800] text-sm border border-[#FFB800]/20 hover:border-[#FFB800]/50 rounded-lg px-3 py-1.5 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
