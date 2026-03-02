"use client";

import { useState } from "react";
import Link from "next/link";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/admin/puestos", label: "Puestos", icon: Monitor, adminOnly: true },
  { href: "/admin/reservas", label: "Reservas", icon: Calendar, adminOnly: false },
  { href: "/admin/metricas", label: "Métricas", icon: BarChart3, adminOnly: false },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings, adminOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const currentLabel = visibleItems.find((i) => i.href === pathname)?.label ?? "Admin";

  function NavLinks({ onClick }: { onClick?: () => void }) {
    return (
      <>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={onClick}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                  isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ── Desktop sidebar ──────────────────────────────────────── */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <Link href="/admin" className="font-semibold text-slate-900">
            Panel Admin
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <NavLinks />
        </nav>
        <div className="border-t border-slate-200 p-4">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* ── Content area ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* ── Mobile top bar ──────────────────────────────────────── */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-900">{currentLabel}</span>
          {/* Sign out shortcut on mobile */}
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* ── Mobile drawer overlay ────────────────────────────────── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Drawer */}
            <aside
              className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                <span className="font-semibold text-slate-900">Panel Admin</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
                  aria-label="Cerrar menú"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto p-4">
                <NavLinks onClick={() => setMobileOpen(false)} />
              </nav>

              <div className="border-t border-slate-200 p-4">
                <div className="mb-3 px-4 py-2">
                  <p className="text-xs text-slate-400">Sesión activa</p>
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {session?.user?.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => signOut({ callbackUrl: "/admin/login" })}
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  Cerrar sesión
                </Button>
              </div>
            </aside>
          </div>
        )}

        {/* ── Page content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
