"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  User,
  Users,
  LayoutDashboard,
  Briefcase,
  Building2,
  Calendar,
  BarChart2,
  TrendingUp,
  FolderOpen,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  Mail,
  Clock,
  Receipt,
  ShieldCheck,
  MapPin,
  Car,
} from "lucide-react";

interface Props {
  userEmail: string;
  userName: string | null;
  userCargo: string | null;
  userAvatar: string | null;
  role: string;
  isFullAccess: boolean;
  isSupervisorOrAbove: boolean;
}

const STORAGE_KEY = "sidebar-collapsed";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface MenuItemDef {
  label: string;
  href: string;
  icon: React.ElementType;
  requireFullAccess?: boolean;
  requireSuperuser?: boolean;
  requireSupervisor?: boolean;
  separator?: boolean;
  submenu?: { label: string; href: string; icon: React.ElementType; requireSuperuser?: boolean }[];
}

const menuItems: MenuItemDef[] = [
  { label: "Meu Perfil", href: "/painel/meu-perfil", icon: User },
  { label: "Banco de Candidatos", href: "/painel/banco-candidatos", icon: Users },
  { label: "Painel", href: "/painel", icon: LayoutDashboard },
  { label: "Vagas", href: "/painel/vagas", icon: Briefcase },
  { label: "Clientes", href: "/painel/clientes", icon: Building2 },
  { label: "Agenda", href: "/painel/agenda", icon: Calendar },
  { label: "Relatórios", href: "/painel/relatorios", icon: BarChart2, requireSupervisor: true },
  { label: "Dashboard", href: "/painel/dashboard", icon: TrendingUp, requireFullAccess: true },
  { label: "Reembolsos", href: "/painel/reembolsos", icon: Receipt, requireFullAccess: true },
  { label: "Quilometragem", href: "/painel/quilometragem", icon: Car },
  { label: "Carteira de Clientes", href: "/painel/empresas-visitadas", icon: MapPin, requireSupervisor: true },
  { label: "Documentos", href: "/painel/documentos", icon: FolderOpen },
  {
    label: "Configurações",
    href: "/painel/configuracoes",
    icon: Settings,
    requireFullAccess: true,
    separator: true,
    submenu: [
      { label: "Config. SLA", href: "/painel/sla-config", icon: Clock },
      { label: "Log de E-mails", href: "/painel/email-logs", icon: Mail },
      { label: "Usuários", href: "/painel/usuarios", icon: Users, requireSuperuser: true },
      { label: "Audit Logs", href: "/painel/audit-logs", icon: ShieldCheck, requireSuperuser: true },
    ],
  },
];

export default function SidebarMenu({
  userName,
  userCargo,
  userAvatar,
  role,
  isFullAccess,
  isSupervisorOrAbove,
  userEmail,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
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
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const toggleCollapse = () => setCollapsed((c) => !c);

  const displayName = userName ?? userEmail;

  function isActive(href: string, submenu?: MenuItemDef["submenu"]) {
    if (href === "/painel") return pathname === "/painel";
    if (submenu) {
      return submenu.some((s) => pathname.startsWith(s.href));
    }
    return pathname.startsWith(href);
  }

  const isSuperuser = role === "superuser";

  const filteredItems = menuItems.filter((item) => {
    if (item.requireFullAccess && !isFullAccess) return false;
    if (item.requireSuperuser && !isSuperuser) return false;
    if (item.requireSupervisor && !isSupervisorOrAbove) return false;
    return true;
  }).map((item) => {
    if (item.submenu) {
      return { ...item, submenu: item.submenu.filter((sub) => !sub.requireSuperuser || isSuperuser) };
    }
    return item;
  });

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
      {/* Toggle button */}
      <div
        className="flex items-center px-4 h-14 shrink-0"
        style={{ justifyContent: collapsed && !mobileOpen ? "center" : "space-between" }}
      >
        {(!collapsed || mobileOpen) && (
          <Link href="/painel" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Salmazos_logo_Amarelo.png"
              alt="Salmazos"
              style={{ height: 32, width: "auto", objectFit: "contain" }}
            />
          </Link>
        )}
        <button
          onClick={() => {
            if (mobileOpen) {
              setMobileOpen(false);
            } else {
              toggleCollapse();
            }
          }}
          className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#1a1a1a]"
          style={{ width: 36, height: 36, color: "#fff", background: "transparent", border: "none", cursor: "pointer" }}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Profile section */}
      <div
        className="flex items-center px-4 py-3 shrink-0"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          gap: collapsed && !mobileOpen ? 0 : 10,
          justifyContent: collapsed && !mobileOpen ? "center" : "flex-start",
        }}
      >
        {userAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userAvatar}
            alt={displayName}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #FFD700",
              flexShrink: 0,
            }}
          />
        ) : (
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
          >
            {getInitials(displayName)}
          </div>
        )}
        {(!collapsed || mobileOpen) && (
          <div style={{ overflow: "hidden", minWidth: 0 }}>
            <div
              style={{
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>
            {userCargo && (
              <div
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {userCargo}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Menu items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: "thin" }}>
        {filteredItems.map((item, i) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.submenu);
          const showSeparator = item.separator;
          const isCollapsedView = collapsed && !mobileOpen;

          if (showSeparator) {
            return (
              <div key={item.href}>
                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
                {item.submenu ? (
                  <>
                    <button
                      onClick={() => {
                        if (isCollapsedView) {
                          router.push(item.submenu![0].href);
                        } else {
                          setConfigOpen((o) => !o);
                        }
                      }}
                      className="group relative flex items-center w-full rounded-lg transition-colors"
                      style={{
                        padding: isCollapsedView ? "8px 0" : "8px 10px",
                        justifyContent: isCollapsedView ? "center" : "flex-start",
                        gap: isCollapsedView ? 0 : 10,
                        background: active ? "#FFD700" : "transparent",
                        color: active ? "#000" : "#fff",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      <Icon size={18} style={{ flexShrink: 0 }} />
                      {!isCollapsedView && (
                        <>
                          <span className="flex-1 text-left">{item.label}</span>
                          <ChevronDown
                            size={14}
                            style={{
                              transition: "transform 0.2s",
                              transform: configOpen ? "rotate(180deg)" : "rotate(0)",
                            }}
                          />
                        </>
                      )}
                      {isCollapsedView && (
                        <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 transition-opacity">
                          {item.label}
                        </span>
                      )}
                    </button>
                    {configOpen && !isCollapsedView && (
                      <div className="ml-4 mt-1 flex flex-col gap-0.5">
                        {item.submenu!.map((sub) => {
                          const SubIcon = sub.icon;
                          const subActive = pathname.startsWith(sub.href);
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              className="flex items-center gap-2 rounded-lg transition-colors"
                              style={{
                                padding: "6px 10px",
                                fontSize: 12,
                                fontWeight: 500,
                                background: subActive ? "#FFD700" : "transparent",
                                color: subActive ? "#000" : "rgba(255,255,255,0.7)",
                                textDecoration: "none",
                              }}
                              onMouseEnter={(e) => {
                                if (!subActive) e.currentTarget.style.background = "#1a1a1a";
                              }}
                              onMouseLeave={(e) => {
                                if (!subActive) e.currentTarget.style.background = "transparent";
                              }}
                            >
                              <SubIcon size={14} />
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <SidebarLink item={item} active={active} isCollapsedView={isCollapsedView} />
                )}
              </div>
            );
          }

          return (
            <SidebarLink key={item.href} item={item} active={active} isCollapsedView={isCollapsedView} />
          );
        })}
      </nav>

      {/* Logout */}
      <div className="shrink-0 px-2 pb-3">
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 0 8px" }} />
        <button
          onClick={handleLogout}
          className="group relative flex items-center w-full rounded-lg transition-colors hover:bg-[#1a1a1a]"
          style={{
            padding: collapsed && !mobileOpen ? "8px 0" : "8px 10px",
            justifyContent: collapsed && !mobileOpen ? "center" : "flex-start",
            gap: collapsed && !mobileOpen ? 0 : 10,
            background: "transparent",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {(!collapsed || mobileOpen) && <span>Sair</span>}
          {collapsed && !mobileOpen && (
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
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - desktop */}
      <aside
        className="hidden md:flex fixed top-0 left-0 h-screen z-40 flex-col"
        style={{
          width: sidebarWidth,
          transition: "width 0.2s ease",
        }}
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
      <div
        className="hidden md:block shrink-0"
        style={{
          width: sidebarWidth,
          transition: "width 0.2s ease",
        }}
      />
    </>
  );
}

function SidebarLink({
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
