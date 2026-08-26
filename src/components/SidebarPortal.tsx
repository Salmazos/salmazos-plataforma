"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createPortalBrowserClient } from "@/lib/supabase/client";
import { Home, ClipboardList, Calendar, IdCard, FolderOpen, LogOut, Menu } from "lucide-react";

interface Props {
  userEmail: string;
  mostrarFuncionarios: boolean;
}

// Mesma identidade visual de SidebarMenu.tsx (plataforma interna) — preto/amarelo, mesmo
// comportamento de colapsar/mobile — mas com o conjunto de itens do portal do cliente, sem
// nada da plataforma interna (grupos, submenu, sino de notificações etc. não existem aqui).
// "Solicitar Vaga" saiu daqui (era um item normal da lista) e virou botão no cabeçalho
// compartilhado (PortalAppLayout), amarelo/preto e centralizado, visível em toda página —
// pedido do Olver pra dar mais destaque do que um item a mais no meio da lista.
const STORAGE_KEY = "sidebar-portal-collapsed";

interface MenuItemDef {
  label: string;
  href: string;
  icon: React.ElementType;
}

const INICIO_ITEM: MenuItemDef = { label: "Início", href: "/portal", icon: Home };
const FUNCIONARIOS_ITEM: MenuItemDef = { label: "Funcionários", href: "/portal/funcionarios", icon: IdCard };
const RESTANTE_ITEMS: MenuItemDef[] = [
  { label: "Minhas Solicitações", href: "/portal/solicitacoes", icon: ClipboardList },
  // Sempre visível — as 5 categorias fixas existem por padrão pra todo cliente, mesmo sem
  // nenhum arquivo enviado ainda (a tela mostra estado vazio por pasta, não esconde nada).
  { label: "Documentos", href: "/portal/documentos", icon: FolderOpen },
  { label: "Agenda", href: "/portal/agenda", icon: Calendar },
];

export default function SidebarPortal({ userEmail, mostrarFuncionarios }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setCollapsed(saved === "true");
    const mobileMatch = window.matchMedia("(max-width: 768px)");
    if (mobileMatch.matches) setCollapsed(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createPortalBrowserClient();
    await supabase.auth.signOut();
    router.push("/portal/login");
  };

  const toggleCollapse = () => setCollapsed((c) => !c);

  // "/portal" precisa de comparação exata (não prefixo) — senão, como toda rota do portal
  // começa com "/portal", o item "Início" ficaria destacado em qualquer página (mesma
  // ressalva de "/painel" em SidebarMenu.tsx).
  function hrefMatches(href: string) {
    return href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
  }

  const items = [
    INICIO_ITEM,
    ...(mostrarFuncionarios ? [FUNCIONARIOS_ITEM] : []),
    ...RESTANTE_ITEMS,
  ];
  const isCollapsedView = collapsed && !mobileOpen;
  const sidebarWidth = collapsed ? 64 : 240;

  const sidebarContent = (
    <div
      className="flex flex-col h-full"
      style={{
        width: collapsed && !mobileOpen ? 64 : 240,
        background: "#000",
        transition: "width 0.2s ease",
      }}
    >
      {/* Logo + toggle */}
      <div
        className="flex items-center px-4 h-[62px] shrink-0"
        style={{ justifyContent: isCollapsedView ? "center" : "space-between" }}
      >
        {!isCollapsedView && (
          <Link href="/portal" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Salmazos_logo_Amarelo.png"
              alt="Salmazos"
              style={{ height: 50, width: "auto", objectFit: "contain" }}
            />
          </Link>
        )}
        <button
          onClick={() => (mobileOpen ? setMobileOpen(false) : toggleCollapse())}
          className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#1a1a1a]"
          style={{ width: 36, height: 36, color: "#fff", background: "transparent", border: "none", cursor: "pointer" }}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <Menu size={20} />
        </button>
      </div>

      {/* "Portal do Cliente" badge — deixa claro que essa sessão não é a plataforma interna,
          caso alguém tenha as duas abertas ao mesmo tempo. */}
      {!isCollapsedView && (
        <div className="px-4 pb-3 shrink-0">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full inline-block"
            style={{ backgroundColor: "#FFD700", color: "#000" }}
          >
            Portal do Cliente
          </span>
        </div>
      )}

      {/* E-mail do usuário */}
      <div
        className="flex items-center px-4 py-3 shrink-0"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          justifyContent: isCollapsedView ? "center" : "flex-start",
        }}
      >
        {isCollapsedView ? (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#FFD700",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#000",
              flexShrink: 0,
            }}
            title={userEmail}
          >
            {userEmail.slice(0, 2).toUpperCase()}
          </div>
        ) : (
          <div
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 12,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {userEmail}
          </div>
        )}
      </div>

      {/* Menu items */}
      <nav className="flex-1 overflow-y-auto py-1 px-2 pt-3" style={{ scrollbarWidth: "thin" }}>
        {items.map((item) => {
          const active = hrefMatches(item.href);
          return <SidebarPortalLink key={item.href} item={item} active={active} isCollapsedView={isCollapsedView} />;
        })}
      </nav>

      {/* Logout */}
      <div className="shrink-0 px-2 pb-3">
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 0 8px" }} />
        <button
          onClick={handleLogout}
          className="group relative flex items-center w-full rounded-lg transition-colors hover:bg-[#1a1a1a]"
          style={{
            padding: isCollapsedView ? "8px 0" : "8px 10px",
            justifyContent: isCollapsedView ? "center" : "flex-start",
            gap: isCollapsedView ? 0 : 10,
            background: "transparent",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {!isCollapsedView && <span>Sair</span>}
          {isCollapsedView && (
            <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 transition-opacity">
              Sair
            </span>
          )}
        </button>
      </div>
    </div>
  );

  if (!mounted) {
    return (
      <div
        style={{
          width: 240,
          background: "#000",
          height: "100vh",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 40,
        }}
      />
    );
  }

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 flex items-center justify-center rounded-lg bg-black"
        style={{ width: 40, height: 40, border: "none", cursor: "pointer", color: "#fff" }}
      >
        <Menu size={22} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar - desktop */}
      <aside
        className="hidden md:flex fixed top-0 left-0 h-screen z-40 flex-col"
        style={{ width: sidebarWidth, transition: "width 0.2s ease" }}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar - mobile */}
      <aside
        className="md:hidden fixed top-0 left-0 h-screen z-50 flex flex-col"
        style={{
          width: 240,
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s ease",
        }}
      >
        {sidebarContent}
      </aside>

      {/* Spacer for desktop layout */}
      <div className="hidden md:block shrink-0" style={{ width: sidebarWidth, transition: "width 0.2s ease" }} />
    </>
  );
}

function SidebarPortalLink({
  item,
  active,
  isCollapsedView,
}: {
  item: MenuItemDef;
  active: boolean;
  isCollapsedView: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group relative flex items-center rounded-lg transition-colors"
      style={{
        padding: isCollapsedView ? "8px 0" : "8px 10px",
        justifyContent: isCollapsedView ? "center" : "flex-start",
        gap: isCollapsedView ? 0 : 10,
        background: active ? "#FFD700" : "transparent",
        color: active ? "#000" : "#fff",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 500,
        marginBottom: 2,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#1a1a1a";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={18} style={{ flexShrink: 0 }} />
      {!isCollapsedView && <span>{item.label}</span>}
      {isCollapsedView && (
        <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 transition-opacity">
          {item.label}
        </span>
      )}
    </Link>
  );
}
