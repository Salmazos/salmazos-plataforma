"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import NotificacoesBell from "@/components/NotificacoesBell";

interface Props {
  userEmail: string;
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const ativo = pathname === href || (href !== "/painel" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        ativo
          ? "bg-[#FFD700] text-black"
          : "text-[#FFB800]/70 hover:text-[#FFB800] hover:bg-white/10"
      }`}
    >
      {label}
    </Link>
  );
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
        <div className="flex items-center gap-6">
          <Link href="/painel" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH & Serviços" className="h-[48px] w-auto object-contain" />
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            <NavLink href="/painel" label="Painel" />
            <NavLink href="/painel/clientes" label="Clientes" />
            <NavLink href="/painel/vagas" label="Vagas" />
            <NavLink href="/painel/relatorios" label="Relatórios" />
            <NavLink href="/painel/dashboard" label="Dashboard" />
            <NavLink href="/painel/agenda" label="Agenda" />
            <NavLink href="/painel/email-logs" label="Log de E-mails" />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <NotificacoesBell />
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
