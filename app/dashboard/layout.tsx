"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowRightCircle, Banknote, BarChart3, Bell, Building2,
  Car, CircleUser, Clock, CreditCard, LogOut, Menu, Monitor,
  Moon, QrCode, ScanLine, Search, Settings2, ShieldCheck, Store, Sun, Tags,
  Users, Map as MapIcon, Wrench,
} from "lucide-react";
import { getToken, getUser, clearSession, type SessionUser } from "@/lib/client";
import { Badge, Dropdown, DropdownItem, IconButton, ToastProvider, cn, fmtDateTime } from "@/lib/ui";
import { apiGet } from "@/lib/client";

/* --------------------------------- nav model ------------------------------ */

const BASE = "/dashboard/membership/parking";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badgeKey?: "notifications";
  /** For links that share a path but differ by ?mode= (self vs cashier exit). */
  matchMode?: "self" | "cashier";
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: BASE, icon: <BarChart3 size={17} /> }],
  },
  {
    label: "Operations",
    items: [
      { label: "Vehicle Entry", href: `${BASE}/entry`, icon: <ArrowRightCircle size={17} /> },
      { label: "Self Checkout", href: `${BASE}/exit?mode=self`, icon: <CircleUser size={17} />, matchMode: "self" },
      { label: "Cashier Exit", href: `${BASE}/exit?mode=cashier`, icon: <Banknote size={17} />, matchMode: "cashier" },
      { label: "Sessions", href: `${BASE}/sessions`, icon: <Clock size={17} /> },
    ],
  },
  {
    label: "Facility",
    items: [
      { label: "Spaces & Zones", href: `${BASE}/spaces`, icon: <MapIcon size={17} /> },
      { label: "Gates", href: `${BASE}/gates`, icon: <ScanLine size={17} /> },
      { label: "Cameras", href: `${BASE}/cameras`, icon: <Monitor size={17} /> },
      { label: "Devices", href: `${BASE}/devices`, icon: <Wrench size={17} /> },
    ],
  },
  {
    label: "Registry",
    items: [
      { label: "Customers", href: `${BASE}/customers`, icon: <Users size={17} /> },
      { label: "Vehicles", href: `${BASE}/vehicles`, icon: <Car size={17} /> },
      { label: "Memberships", href: `${BASE}/memberships`, icon: <CreditCard size={17} /> },
    ],
  },
  {
    label: "Access",
    items: [
      { label: "Access Control", href: `${BASE}/access`, icon: <ShieldCheck size={17} /> },
      { label: "RFID Cards", href: `${BASE}/rfid-cards`, icon: <CreditCard size={17} /> },
      { label: "QR Access", href: `${BASE}/qr-access`, icon: <ScanLine size={17} /> },
      { label: "QR Tickets", href: `${BASE}/qr-tickets`, icon: <QrCode size={17} /> },
      { label: "Kiosk", href: `${BASE}/kiosk`, icon: <Store size={17} /> },
    ],
  },
  {
    label: "Commercial",
    items: [
      { label: "Tariffs & Pricing", href: `${BASE}/tariffs`, icon: <Tags size={17} /> },
      { label: "Cashier & Shifts", href: `${BASE}/cashier`, icon: <Banknote size={17} /> },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", href: `${BASE}/reports`, icon: <BarChart3 size={17} /> },
      { label: "Audit Log", href: `${BASE}/audit`, icon: <Settings2 size={17} /> },
    ],
  },
];

const CRUMBS: Array<[string, string]> = [
  ["entry", "Vehicle Entry"],
  ["exit", "Vehicle Exit"],
  ["sessions", "Parking Sessions"],
  ["spaces", "Spaces & Zones"],
  ["zones", "Zones & Lots"],
  ["slots", "Parking Slots"],
  ["gates", "Gates"],
  ["cameras", "Cameras"],
  ["devices", "Devices & Integrations"],
  ["customers", "Customers"],
  ["vehicles", "Vehicles"],
  ["memberships", "Memberships"],
  ["tariffs", "Tariffs & Pricing"],
  ["rates", "Rates"],
  ["cashier", "Cashier & Shifts"],
  ["pos", "POS Terminal"],
  ["reports", "Reports"],
  ["audit", "Audit Log"],
  ["access", "Access Control"],
  ["qr-access", "QR Access"],
  ["qr-tickets", "QR Tickets"],
  ["kiosk", "Kiosk"],
  ["rfid-cards", "RFID Cards"],
  ["subscriptions", "Subscriptions"],
];

/* ------------------------------- global search ---------------------------- */

interface SearchResults {
  sessions: Array<{ id: number; ticket_number: string; plate_number: string; status: string; payment_status: string; entry_time: string }>;
  vehicles: Array<{ id: number; plate_number: string; vehicle_type: string; owner_name: string; is_blacklisted: boolean }>;
  customers: Array<{ id: number; full_name: string; customer_id: string; phone: string; status: string }>;
}

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setResults(await apiGet<SearchResults>(`/api/membership/parking/search?q=${encodeURIComponent(q.trim())}`));
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;
  const empty = results && results.sessions.length === 0 && results.vehicles.length === 0 && results.customers.length === 0;

  return (
    <div className="pk-overlay fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pk-dialog w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-3 border-b border-[var(--card-border)] px-4">
          <Search size={16} className="shrink-0 text-[var(--text-tertiary)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search plates, tickets, customers…"
            className="h-12 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
            aria-label="Global search"
          />
          <kbd className="rounded-md border border-[var(--border-color)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {q.trim().length < 2 && (
            <p className="px-3 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
              Type at least 2 characters — search across active sessions, registered vehicles and customers.
            </p>
          )}
          {loading && <p className="px-3 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Searching…</p>}
          {empty && <p className="px-3 py-8 text-center text-[13px] text-[var(--text-tertiary)]">No matches for “{q}”.</p>}
          {results && (
            <>
              {results.sessions.length > 0 && (
                <SearchGroup title="Parking sessions">
                  {results.sessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`${BASE}/sessions?q=${encodeURIComponent(s.plate_number || s.ticket_number)}`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--surface-sunken)]"
                    >
                      <Badge tone={s.status === "active" ? "success" : "neutral"} dot>
                        {s.status}
                      </Badge>
                      <span className="font-semibold text-[var(--text-primary)]">{s.plate_number || s.ticket_number}</span>
                      <span className="ml-auto text-xs text-[var(--text-tertiary)]">{s.ticket_number}</span>
                    </Link>
                  ))}
                </SearchGroup>
              )}
              {results.vehicles.length > 0 && (
                <SearchGroup title="Vehicles">
                  {results.vehicles.map((v) => (
                    <Link
                      key={v.id}
                      href={`${BASE}/vehicles?q=${encodeURIComponent(v.plate_number)}`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--surface-sunken)]"
                    >
                      <Car size={14} className="text-[var(--text-tertiary)]" />
                      <span className="font-semibold text-[var(--text-primary)]">{v.plate_number}</span>
                      <span className="text-xs capitalize text-[var(--text-tertiary)]">{v.vehicle_type}</span>
                      {v.owner_name && <span className="ml-auto text-xs text-[var(--text-tertiary)]">{v.owner_name}</span>}
                      {v.is_blacklisted && <Badge tone="danger">blacklisted</Badge>}
                    </Link>
                  ))}
                </SearchGroup>
              )}
              {results.customers.length > 0 && (
                <SearchGroup title="Customers">
                  {results.customers.map((c) => (
                    <Link
                      key={c.id}
                      href={`${BASE}/customers?q=${encodeURIComponent(c.full_name)}`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--surface-sunken)]"
                    >
                      <Users size={14} className="text-[var(--text-tertiary)]" />
                      <span className="font-semibold text-[var(--text-primary)]">{c.full_name}</span>
                      <span className="ml-auto text-xs text-[var(--text-tertiary)]">{c.phone || c.customer_id}</span>
                    </Link>
                  ))}
                </SearchGroup>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{title}</div>
      {children}
    </div>
  );
}

/* ------------------------------- notifications ---------------------------- */

interface NotificationItem {
  id: string;
  type: "info" | "warning" | "error";
  title: string;
  body: string;
  href: string;
  date: string;
}

function NotificationsPanel() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ notifications: NotificationItem[] }>("/api/membership/parking/notifications");
      setItems(res.notifications);
    } catch {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  useEffect(() => {
    load().catch(() => {});
    const iv = setInterval(() => load().catch(() => {}), 120_000);
    return () => clearInterval(iv);
  }, [load]);

  const count = items?.length ?? 0;
  return (
    <Dropdown
      width={360}
      trigger={
        <button
          aria-label={`Notifications${count ? ` (${count})` : ""}`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border-color)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <Bell size={16} />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-red)] px-1 text-[9.5px] font-bold text-white pk-num">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-2.5">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Alerts</span>
            <Badge tone={count > 0 ? "warning" : "success"}>{count} active</Badge>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {items === null && <p className="px-4 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Loading…</p>}
            {items?.length === 0 && (
              <p className="px-4 py-10 text-center text-[13px] text-[var(--text-tertiary)]">All clear — no operational alerts.</p>
            )}
            {items?.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => {
                  close();
                  setOpen(false);
                }}
                className="flex gap-3 border-b border-[var(--card-border)] px-4 py-3 last:border-0 hover:bg-[var(--surface-sunken)]"
              >
                <AlertTriangle
                  size={15}
                  className={cn("mt-0.5 shrink-0", n.type === "error" ? "text-[var(--accent-red)]" : n.type === "warning" ? "text-amber-500" : "text-sky-500")}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[var(--text-primary)]">{n.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-tertiary)]">{n.body}</span>
                  <span className="mt-1 block text-[10.5px] text-[var(--text-tertiary)]">{fmtDateTime(n.date)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}

/* --------------------------------- the shell ------------------------------ */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [searchOpen, setSearchOpen] = useState(false);
  const [site, setSite] = useState<{ id: number; name: string } | null>(null);
  const [sites, setSites] = useState<Array<{ id: number; name: string }>>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    setCollapsed(localStorage.getItem("pk.sidebar-collapsed") === "1");
    const savedTheme = (localStorage.getItem("theme") as "light" | "dark") || "light";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
    const savedSite = localStorage.getItem("pk.site");
    if (savedSite) {
      try {
        setSite(JSON.parse(savedSite));
      } catch {}
    }
    setReady(true);
    apiGet<Array<{ id: number; name: string }>>("/api/membership/parking/sites?limit=50")
      .then((rows) => setSites(rows.filter((r) => (r as any).is_active !== false)))
      .catch(() => {});
  }, [router]);

  useEffect(() => setDrawer(false), [pathname]);

  // Track the query string so sidebar links that share a path
  // (Self Checkout vs Cashier Exit) can highlight independently.
  useEffect(() => {
    setSearch(window.location.search);
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const out: Array<{ label: string; href?: string }> = [{ label: "Parking", href: BASE }];
    const after = parts.slice(3).join("/");
    if (!after || parts[3] === undefined) return out;
    let acc = `${BASE}`;
    for (const p of parts.slice(3)) {
      acc += `/${p}`;
      const found = CRUMBS.find(([seg]) => seg === p);
      out.push({ label: found ? found[1] : p.charAt(0).toUpperCase() + p.slice(1), href: acc });
    }
    return out;
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center" suppressHydrationWarning>
        <div className="pk-spinner" suppressHydrationWarning />
      </div>
    );
  }

  const sidebar = (mobile: boolean) => (
    <div
      className={cn("flex h-full flex-col", mobile ? "w-[264px]" : collapsed ? "w-[68px]" : "w-[248px]")}
      style={{ background: "var(--sidebar-bg)", transition: "width .18s ease" }}
    >
      <div className="flex items-center gap-2.5 border-b px-4 py-4" style={{ borderColor: "var(--sidebar-border)", minHeight: 61 }}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#1d4ed8,#0e9bdb)" }}>
          <Car size={18} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold leading-tight text-white">Meridian Parking</div>
            <div className="text-[10.5px]" style={{ color: "var(--sidebar-text)" }}>
              Operations Console
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Primary">
        {NAV.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgba(148,163,184,0.55)" }}>
                {group.label}
              </div>
            )}
            {collapsed && <div className="mx-auto mb-1.5 h-px w-6" style={{ background: "var(--sidebar-border)" }} />}
            {group.items.map((item) => {
              const pathOnly = item.href.split("?")[0];
              const modeParam = new URLSearchParams(search).get("mode") || "self";
              const active = item.href === BASE
                ? pathname === BASE
                : item.matchMode
                  ? pathname === pathOnly && modeParam === item.matchMode
                  : pathname.startsWith(pathOnly);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    const qi = item.href.indexOf("?");
                    setSearch(qi >= 0 ? item.href.slice(qi) : "");
                  }}
                  className={cn(
                    "group mb-0.5 flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-colors",
                    collapsed && "justify-center px-0"
                  )}
                  style={{
                    background: active ? "var(--sidebar-active)" : "transparent",
                    color: active ? "#fff" : "var(--sidebar-text)",
                  }}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(148,163,184,0.55)" }}>
            Signed in
          </div>
          <div className="truncate text-[13px] font-semibold text-white">{user?.name || user?.email}</div>
          <div className="text-[11px] capitalize" style={{ color: "var(--sidebar-text)" }}>
            {(user?.role || "").replace(/_/g, " ")}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ToastProvider>
      <div className="flex min-h-screen" style={{ background: "var(--bg)" }} suppressHydrationWarning>
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar(false)}</aside>
        {!collapsed && <div className="hidden lg:block lg:w-[248px] shrink-0" aria-hidden />}
        <div className={cn("hidden lg:block shrink-0", collapsed && "lg:w-[68px]")} aria-hidden />

        {/* Mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="h-full">{sidebar(true)}</div>
            <div className="flex-1 bg-black/55" onClick={() => setDrawer(false)} />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="sticky top-0 z-20 flex items-center gap-2 border-b px-3 py-2.5 backdrop-blur lg:px-5"
            style={{
              background: "color-mix(in srgb, var(--bg-elevated) 86%, transparent)",
              borderColor: "var(--card-border)",
              minHeight: 61,
            }}
          >
            <IconButton label="Open navigation" className="lg:hidden" onClick={() => setDrawer(true)}>
              <Menu size={18} />
            </IconButton>

            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <span className="text-[var(--text-tertiary)]">/</span>}
                  {c.href && i < crumbs.length - 1 ? (
                    <Link href={c.href} className="truncate text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="truncate font-semibold text-[var(--text-primary)]">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <span className="truncate text-[13px] font-semibold md:hidden" style={{ color: "var(--text-primary)" }}>
              {crumbs[crumbs.length - 1]?.label}
            </span>

            <div className="ml-auto flex items-center gap-2">
              {/* Global search */}
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden h-9 items-center gap-2 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-sunken)] px-3 text-[13px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] sm:flex"
                aria-label="Open global search"
              >
                <Search size={14} />
                <span>Search…</span>
                <kbd className="rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
              </button>
              <IconButton label="Search" className="sm:hidden" onClick={() => setSearchOpen(true)}>
                <Search size={16} />
              </IconButton>

              {/* Site selector */}
              {sites.length > 0 && (
                <Dropdown
                  width={230}
                  trigger={
                    <button className="hidden h-9 items-center gap-2 rounded-[10px] border border-[var(--border-color)] px-3 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] md:inline-flex">
                      <Building2 size={14} className="text-[var(--text-tertiary)]" />
                      <span className="max-w-[130px] truncate">{site?.name ?? "All facilities"}</span>
                    </button>
                  }
                >
                  {(close) => (
                    <>
                      <DropdownItem
                        active={!site}
                        onClick={() => {
                          setSite(null);
                          localStorage.removeItem("pk.site");
                          window.dispatchEvent(new CustomEvent("pk-site-change"));
                          close();
                        }}
                      >
                        All facilities
                      </DropdownItem>
                      {sites.map((s) => (
                        <DropdownItem
                          key={s.id}
                          active={site?.id === s.id}
                          onClick={() => {
                            const v = { id: s.id, name: s.name };
                            setSite(v);
                            localStorage.setItem("pk.site", JSON.stringify(v));
                            window.dispatchEvent(new CustomEvent("pk-site-change"));
                            close();
                          }}
                        >
                          {s.name}
                        </DropdownItem>
                      ))}
                    </>
                  )}
                </Dropdown>
              )}

              <NotificationsPanel />

              <IconButton label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} onClick={toggleTheme}>
                {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
              </IconButton>

              {/* User menu */}
              <Dropdown
                width={220}
                trigger={
                  <button className="flex h-9 items-center gap-2 rounded-[10px] border border-[var(--border-color)] pl-1.5 pr-2.5 transition-colors hover:bg-[var(--surface-sunken)]">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: "linear-gradient(135deg,#1d4ed8,#0e9bdb)" }}
                    >
                      {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden max-w-[110px] truncate text-[13px] font-medium text-[var(--text-secondary)] sm:inline">
                      {user?.name || user?.email}
                    </span>
                  </button>
                }
              >
                {(close) => (
                  <>
                    <div className="border-b border-[var(--card-border)] px-3.5 py-2.5">
                      <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{user?.name || user?.email}</div>
                      <div className="truncate text-[11.5px] text-[var(--text-tertiary)]">{user?.email}</div>
                      <Badge tone="primary" className="mt-1.5 capitalize">
                        {(user?.role || "").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="px-2 py-1.5 text-[11px] text-[var(--text-tertiary)]">{user?.company_name}</div>
                    <DropdownItem
                      icon={<LogOut size={14} />}
                      danger
                      onClick={() => {
                        close();
                        logout();
                      }}
                    >
                      Sign out
                    </DropdownItem>
                  </>
                )}
              </Dropdown>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
        </div>

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </ToastProvider>
  );
}
