"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import NotificacoesBell from "@/components/NotificacoesBell";

interface Props {
  userEmail: string;
  isSuperuser?: boolean;
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

function ConfigDropdown({ isSuperuser }: { isSuperuser: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const configPaths = ["/painel/email-logs", "/painel/sla-config"];
  const ativo = configPaths.some((p) => pathname.startsWith(p));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={ref}
      style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 12px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          border: "none",
          cursor: "pointer",
          transition: "all 0.15s",
          background: ativo ? "#FFD700" : "transparent",
          color: ativo ? "#000" : "rgba(255,184,0,0.7)",
        }}
      >
        <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Configurações
        <svg style={{ width: 10, height: 10, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "#1F2937",
            border: "1px solid rgba(255,184,0,0.15)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            minWidth: 180,
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <Link
            href="/painel/email-logs"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: pathname.startsWith("/painel/email-logs") ? 700 : 500,
              color: pathname.startsWith("/painel/email-logs") ? "#FFD700" : "rgba(255,184,0,0.7)",
              textDecoration: "none",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            Log de E-mails
          </Link>
          {isSuperuser && (
            <Link
              href="/painel/sla-config"
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: pathname.startsWith("/painel/sla-config") ? 700 : 500,
                color: pathname.startsWith("/painel/sla-config") ? "#FFD700" : "rgba(255,184,0,0.7)",
                textDecoration: "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              Config. SLA
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function NavbarPainel({ userEmail, isSuperuser = false }: Props) {
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
            <NavLink href="/painel/banco-candidatos" label="Banco de Candidatos" />
            <NavLink href="/painel" label="Painel" />
            <NavLink href="/painel/vagas" label="Vagas" />
            <NavLink href="/painel/clientes" label="Clientes" />
            <NavLink href="/painel/agenda" label="Agenda" />
            <NavLink href="/painel/relatorios" label="Relatórios" />
            <NavLink href="/painel/dashboard" label="Dashboard" />
            <ConfigDropdown isSuperuser={isSuperuser} />
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
