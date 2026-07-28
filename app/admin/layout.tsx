"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Monitor,
  Calendar,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "General",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/reservas", label: "Reservas", icon: Calendar },
      { href: "/admin/metricas", label: "Métricas", icon: BarChart3 },
    ],
  },
  {
    title: "Gestión",
    items: [
      { href: "/admin/puestos", label: "Simuladores", icon: Monitor, adminOnly: true },
      { href: "/admin/configuracion", label: "Configuración", icon: Settings, adminOnly: true },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentLabel = allItems.find((i) => i.href === pathname)?.label ?? "Admin";

  function NavList({ onClick }: { onClick?: () => void }) {
    return (
      <div className="space-y-6">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (!items.length) return null;
          return (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">
                {group.title}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href} onClick={onClick}>
                      <div
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-white/[0.06] text-white"
                            : "text-white/55 hover:bg-white/[0.04] hover:text-white/90"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#E60012]" />
                        )}
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            active ? "text-[#E60012]" : "text-white/45 group-hover:text-white/80"
                          )}
                        />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function Brand() {
    return (
      <Link href="/admin" className="flex items-center gap-2.5">
        <Image src="/race-room-rr.png" alt="Race Room" width={36} height={36} className="h-9 w-9 rounded-lg" />
        <div className="leading-tight">
          <p className="font-racing text-lg tracking-wide text-white">RACE ROOM</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#E60012]">Panel Admin</p>
        </div>
      </Link>
    );
  }

  function UserFooter() {
    return (
      <div className="rounded-xl bg-white/[0.04] p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E60012]/20 text-xs font-bold text-[#E60012]">
            {(session?.user?.email ?? "A")[0].toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white/90">{session?.user?.email ?? "—"}</p>
            <p className="text-[10px] uppercase tracking-wide text-white/35">
              {isAdmin ? "Administrador" : "Operador"}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F6F7F9]">
      {/* ── Desktop sidebar ──────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#0A0A0C] lg:flex">
        <div className="flex h-16 items-center border-b border-white/[0.06] px-5">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <NavList />
        </nav>
        <div className="border-t border-white/[0.06] p-3">
          <UserFooter />
        </div>
      </aside>

      {/* ── Content area ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-[#F6F7F9]/85 px-4 backdrop-blur-md lg:h-16 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-200/60 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="hidden text-[11px] font-medium uppercase tracking-wider text-slate-400 lg:block">
              Race Room
            </p>
            <h1 className="truncate text-base font-semibold text-slate-900 lg:text-lg">{currentLabel}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              En vivo
            </span>
          </div>
        </header>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileOpen(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <aside
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#0A0A0C] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-5">
                <Brand />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-2 text-white/50 transition hover:bg-white/10"
                  aria-label="Cerrar menú"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-3 py-5">
                <NavList onClick={() => setMobileOpen(false)} />
              </nav>
              <div className="border-t border-white/[0.06] p-3">
                <UserFooter />
              </div>
            </aside>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
