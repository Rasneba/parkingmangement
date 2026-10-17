"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, LogOut, Layers, Grid3x3, DoorOpen, Camera, Users, Truck,
  CreditCard, ShieldCheck, ScanLine, CalendarCheck, Clock, DollarSign, QrCode,
  Store, Monitor, BarChart3, Car, Menu, X, Moon, Sun, ChevronDown,
} from "lucide-react";
import { getToken, getUser, clearSession, type SessionUser } from "@/lib/client";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const BASE = "/dashboard/membership/parking";

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Parking Dashboard", href: BASE, icon: <LayoutDashboard size={18} /> }],
  },
  {
    label: "Facility",
    items: [
      { label: "Zones & Lots", href: `${BASE}/zones`, icon: <Layers size={18} /> },
      { label: "Slots", href: `${BASE}/slots`, icon: <Grid3x3 size={18} /> },
      { label: "Gates", href: `${BASE}/gates`, icon: <DoorOpen size={18} /> },
      { label: "Cameras", href: `${BASE}/cameras`, icon: <Camera size={18} /> },
    ],
  },
  {
    label: "Registry",
    items: [
      { label: "Customers", href: `${BASE}/customers`, icon: <Users size={18} /> },
      { label: "Vehicles", href: `${BASE}/vehicles`, icon: <Truck size={18} /> },
      { label: "RFID Cards", href: `${BASE}/rfid-cards`, icon: <CreditCard size={18} /> },
    ],
  },
  {
    label: "Access",
    items: [
      { label: "Access Control", href: `${BASE}/access`, icon: <ShieldCheck size={18} /> },
      { label: "QR Access", href: `${BASE}/qr-access`, icon: <ScanLine size={18} /> },
      { label: "QR Tickets", href: `${BASE}/qr-tickets`, icon: <QrCode size={18} /> },
      { label: "Kiosk", href: `${BASE}/kiosk`, icon: <Store size={18} /> },
    ],
  },
  {
    label: "Commercial",
    items: [
      { label: "Subscriptions", href: `${BASE}/subscriptions`, icon: <CalendarCheck size={18} /> },
      { label: "Rates", href: `${BASE}/rates`, icon: <DollarSign size={18} /> },
      { label: "POS", href: `${BASE}/pos`, icon: <Monitor size={18} /> },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Sessions", href: `${BASE}/sessions`, icon: <Clock size={18} /> },
      { label: "Reports", href: `${BASE}/reports`, icon: <BarChart3 size={18} /> },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    setReady(true);
    const saved = (localStorage.getItem("theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, [router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const logout = () => {
    clearSession();
    router.replace("/login");
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" suppressHydrationWarning>
        <div className="pk-spinner" suppressHydrationWarning />
      </div>
    );
  }

  const sidebar = (
    <div className="h-full flex flex-col" style={{ background: "var(--sidebar-bg)" }}>
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid rgba(148,163,184,0.15)" }}>
        <div className="text-white p-2 rounded-xl" style={{ background: "var(--accent-gradient)" }}>
          <Car size={20} />
        </div>
        <div>
          <div className="text-white font-bold leading-tight">Parking</div>
          <div className="text-[11px]" style={{ color: "var(--sidebar-text)" }}>
            Management System
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map((group) => (
          <div key={group.label} className="mb-2">
            <div
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "rgba(148,163,184,0.7)" }}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const active =
                item.href === BASE
                  ? pathname === BASE
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl mb-0.5 text-sm font-medium transition-colors"
                  style={{
                    background: active ? "var(--sidebar-active)" : "transparent",
                    color: active ? "#fff" : "var(--sidebar-text)",
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
        <div className="text-[11px]" style={{ color: "rgba(148,163,184,0.7)" }}>
          Signed in
        </div>
        <div className="text-sm text-white font-semibold truncate">{user?.name || user?.email}</div>
        <div className="text-[11px] capitalize" style={{ color: "var(--sidebar-text)" }}>
          {user?.role?.replace(/_/g, " ")}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }} suppressHydrationWarning>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30">{sidebar}</aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 h-full">{sidebar}</div>
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header
          className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 lg:px-6 py-3 backdrop-blur"
          style={{
            background: "color-mix(in srgb, var(--bg-elevated) 88%, transparent)",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {user?.company_name || "Parking Operations"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl"
              style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
              aria-label="Toggle theme"
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <div className="relative group">
              <button
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm"
                style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs" style={{ background: "var(--accent)" }}>
                  {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate">{user?.name || user?.email}</span>
                <ChevronDown size={14} />
              </button>
              <div
                className="absolute right-0 mt-1 w-44 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
              >
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2.5 text-sm rounded-xl flex items-center gap-2"
                  style={{ color: "var(--accent-red)" }}
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
