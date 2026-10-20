"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight, ArrowRightCircle, ArrowUpRight, Banknote, Car, CircleParking, Clock,
  CreditCard, DoorOpen, Grid3x3, LayoutGrid, RefreshCw, Search, Timer, TrendingUp, Users, Wrench,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, DataTable, DateRangeInput, Dialog, EmptyState, Progress,
  Select, Skeleton, TrendPill, cn, fmtDateTime, fmtDuration, fmtInt, fmtMoney, relativeTime,
} from "@/lib/ui";
import { apiGet } from "@/lib/client";
import { BarsChart, DonutChart, HBarChart, LineAreaChart } from "@/components/charts";

/* --------------------------------- types ---------------------------------- */

interface Analytics {
  range: { from: string; to: string };
  capacity: { total: number; occupied: number; available: number; reserved: number; maintenance: number; accessible: number; occupancyPct: number };
  kpis: {
    vehiclesInside: number; entriesToday: number; exitsToday: number;
    entriesYesterday: number; exitsYesterday: number;
    revenueToday: number; revenueYesterday: number;
    unpaidOvernight: number; unpaidAmount: number; unpaidCount: number;
    activeSubscriptions: number; subscriptionMrr: number; rangeRevenueTotal: number;
  };
  charts: {
    hourly: Array<{ hour: number; entries: number; exits: number }>;
    revenueByDay: Array<{ day: string; total: number; transactions: number }>;
    revenueByMethod: Array<{ method: string; total: number; tx: number }>;
    zones: Array<{ zoneId: number; name: string; code: string; floor: number | null; type: string; capacity: number; occupied: number; reserved: number; maintenance: number }>;
    vehicleTypes: Array<{ type: string; count: number }>;
    subscriptionRevenue: number; casualRevenue: number;
    dailyEntries: Array<{ day: string; entries: number }>;
    occupancyByDay: Array<{ day: string; occupied: number; pct: number }>;
  };
  recent: any[];
}

interface FloorSlot {
  id: number; zone_id: number; slot_number: string; floor: number | null;
  status: string; type: string;
  session_id: number | null; ticket_number: string | null; plate_number: string | null;
  entry_time: string | null; vehicle_type: string | null; owner_name: string | null; minutes_parked: number | null;
}
interface FloorZone {
  id: number; name: string; code: string; floor: number | null; type: string; site_id: number | null; site_name: string | null;
  capacity: number; occupied: number; reserved: number; maintenance: number; available: number; occupancyPct: number;
  slots: FloorSlot[];
}
interface FloorMap {
  zones: FloorZone[];
  totals: { capacity: number; occupied: number; reserved: number; maintenance: number };
  generatedAt: string;
}

const PALETTE = ["#1d4ed8", "#0e9bdb", "#0d9488", "#059669", "#d97706", "#7c3aed", "#dc2626", "#64748b"];

function dayLabel(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* --------------------------------- the page ------------------------------- */

export default function ParkingDashboard() {
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const now = new Date();
    return {
      from: new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    };
  });
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [floorMap, setFloorMap] = useState<FloorMap | null>(null);
  const [floorError, setFloorError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [mapFilters, setMapFilters] = useState({ zone: "", floor: "", status: "", type: "", q: "" });
  const [selectedSlot, setSelectedSlot] = useState<FloorSlot | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await apiGet<Analytics>(
        `/api/membership/parking/analytics?from=${range.from}&to=${range.to}`
      );
      setAnalytics(res);
      setAnalyticsError(null);
      setLastRefresh(new Date());
    } catch (e: any) {
      setAnalyticsError(e.message || "Failed to load analytics");
    }
  }, [range.from, range.to]);

  const loadFloorMap = useCallback(async () => {
    try {
      const res = await apiGet<FloorMap>("/api/membership/parking/floor-map");
      setFloorMap(res);
      setFloorError(null);
    } catch (e: any) {
      setFloorError(e.message || "Failed to load facility map");
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);
  useEffect(() => {
    loadFloorMap();
  }, [loadFloorMap]);

  // Live polling (paused when the tab is hidden or live mode is off).
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  useEffect(() => {
    const iv = setInterval(() => {
      if (!liveRef.current || document.hidden) return;
      loadAnalytics();
      loadFloorMap();
    }, 20_000);
    return () => clearInterval(iv);
  }, [loadAnalytics, loadFloorMap]);

  const zoneOptions = useMemo(() => (floorMap?.zones ?? []).map((z) => ({ value: String(z.id), label: `${z.code} — ${z.name}` })), [floorMap]);
  const floors = useMemo(() => Array.from(new Set((floorMap?.zones ?? []).map((z) => z.floor ?? 0))), [floorMap]);

  const filteredZones = useMemo(() => {
    if (!floorMap) return [];
    return floorMap.zones
      .filter((z) => !mapFilters.zone || String(z.id) === mapFilters.zone)
      .filter((z) => !mapFilters.floor || String(z.floor ?? 0) === mapFilters.floor)
      .map((z) => ({
        ...z,
        slots: z.slots
          .filter((s) => !mapFilters.status || s.status === mapFilters.status)
          .filter((s) => !mapFilters.type || s.type === mapFilters.type)
          .filter((s) => !mapFilters.q || (s.plate_number || "").toLowerCase().includes(mapFilters.q.toLowerCase()) || s.slot_number.toLowerCase().includes(mapFilters.q.toLowerCase())),
      }))
      .filter((z) => z.slots.length > 0 || (!mapFilters.status && !mapFilters.type && !mapFilters.q));
  }, [floorMap, mapFilters]);

  const hourlyData = useMemo(() => {
    if (!analytics) return [];
    const map = new Map<number, { entries: number; exits: number }>();
    for (let h = 0; h < 24; h++) map.set(h, { entries: 0, exits: 0 });
    for (const r of analytics.charts.hourly) map.set(r.hour, { entries: r.entries, exits: r.exits });
    return Array.from(map.entries()).map(([hour, v]) => ({
      x: `${String(hour).padStart(2, "0")}:00`,
      entries: v.entries,
      exits: v.exits,
    }));
  }, [analytics]);

  const loading = !analytics && !analyticsError;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {/* ------------------------------ header ------------------------------ */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Operations Dashboard</h1>
            <button
              onClick={() => setLive((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                live ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-[var(--border-color)] text-[var(--text-tertiary)]"
              )}
              aria-pressed={live}
              title={live ? "Live updates on (20s)" : "Live updates paused"}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-500 pk-live-dot" : "bg-[var(--text-tertiary)]")} />
              {live ? "Live" : "Paused"}
            </button>
          </div>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
            {lastRefresh ? `Updated ${relativeTime(lastRefresh)}` : "Loading live data"} · {analytics ? `Range ${analytics.range.from} → ${analytics.range.to}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeInput
            from={range.from}
            to={range.to}
            onFrom={(v) => v && setRange((r) => ({ ...r, from: v }))}
            onTo={(v) => v && setRange((r) => ({ ...r, to: v }))}
          />
          <Button variant="outline" size="md" icon={<RefreshCw size={14} />} onClick={() => { loadAnalytics(); loadFloorMap(); }}>
            Refresh
          </Button>
          <Link href="/dashboard/membership/parking/entry">
            <Button size="md" icon={<ArrowRightCircle size={15} />}>Vehicle Entry</Button>
          </Link>
          <Link href="/dashboard/membership/parking/exit?mode=cashier">
            <Button size="md" variant="success" icon={<DoorOpen size={15} />}>Vehicle Exit</Button>
          </Link>
        </div>
      </div>

      {analyticsError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-[13px] font-medium text-[var(--accent-red)]">Failed to load analytics — {analyticsError}</p>
            <Button size="sm" variant="outline" onClick={loadAnalytics}>Retry</Button>
          </div>
        </Card>
      )}
      {floorError && !floorMap && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-[13px] font-medium text-[var(--accent-red)]">Facility map unavailable — {floorError}</p>
            <Button size="sm" variant="outline" onClick={loadFloorMap}>Retry</Button>
          </div>
        </Card>
      )}

      {/* ------------------------------- KPIs ------------------------------- */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-24" />
            </Card>
          ))}
        </div>
      ) : analytics ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Occupancy" value={`${analytics.capacity.occupancyPct}%`}
            sub={`${fmtInt(analytics.capacity.occupied)} of ${fmtInt(analytics.capacity.total)} spaces`}
            icon={<CircleParking size={16} />} tone={analytics.capacity.occupancyPct >= 90 ? "danger" : analytics.capacity.occupancyPct >= 70 ? "warning" : "success"}
            progress={analytics.capacity.occupancyPct}
            href="/dashboard/membership/parking/spaces"
          />
          <Kpi
            label="Available" value={fmtInt(analytics.capacity.available)}
            sub={`${fmtInt(analytics.capacity.reserved)} reserved · ${fmtInt(analytics.capacity.maintenance)} maintenance`}
            icon={<Grid3x3 size={16} />} tone="primary"
            href="/dashboard/membership/parking/spaces"
          />
          <Kpi
            label="Vehicles inside" value={fmtInt(analytics.kpis.vehiclesInside)}
            sub="currently parked"
            icon={<Car size={16} />} tone="purple"
            href="/dashboard/membership/parking/sessions?status=active"
          />
          <Kpi
            label="Entered today" value={fmtInt(analytics.kpis.entriesToday)}
            icon={<ArrowDownRight size={16} />} tone="primary"
            trend={{ current: analytics.kpis.entriesToday, previous: analytics.kpis.entriesYesterday }}
            href="/dashboard/membership/parking/sessions?status=active,completed"
          />
          <Kpi
            label="Exited today" value={fmtInt(analytics.kpis.exitsToday)}
            icon={<ArrowUpRight size={16} />} tone="success"
            trend={{ current: analytics.kpis.exitsToday, previous: analytics.kpis.exitsYesterday }}
            href="/dashboard/membership/parking/sessions?status=completed"
          />
          <Kpi
            label="Revenue today" value={fmtMoney(analytics.kpis.revenueToday)}
            icon={<Banknote size={16} />} tone="success"
            trend={{ current: analytics.kpis.revenueToday, previous: analytics.kpis.revenueYesterday }}
            href="/dashboard/membership/parking/cashier"
          />
          <Kpi
            label="Unpaid fees" value={fmtMoney(analytics.kpis.unpaidAmount)}
            sub={`${fmtInt(analytics.kpis.unpaidCount)} open session(s)`}
            icon={<Timer size={16} />} tone={analytics.kpis.unpaidCount > 0 ? "warning" : "neutral"}
            href="/dashboard/membership/parking/sessions?status=active&payment_status=unpaid"
          />
          <Kpi
            label="Active subscriptions" value={fmtInt(analytics.kpis.activeSubscriptions)}
            sub={`MRR ${fmtMoney(analytics.kpis.subscriptionMrr)}`}
            icon={<CreditCard size={16} />} tone="purple"
            href="/dashboard/membership/parking/memberships"
          />
          <Kpi
            label={`Revenue ${analytics.range.from.slice(5)} → ${analytics.range.to.slice(5)}`} value={fmtMoney(analytics.kpis.rangeRevenueTotal)}
            sub="selected range"
            icon={<TrendingUp size={16} />} tone="primary"
            href="/dashboard/membership/parking/reports?type=revenue"
          />
          <Kpi
            label="Accessible spaces" value={fmtInt(analytics.capacity.accessible)}
            sub="designated accessible"
            icon={<Users size={16} />} tone="neutral"
            href="/dashboard/membership/parking/spaces"
          />
        </div>
      ) : null}

      {/* ------------------------------ charts ------------------------------ */}
      {analytics && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Vehicle flow by hour" subtitle={`Entries vs exits · ${analytics.range.from} → ${analytics.range.to}`}
                actions={<Legend items={[{ name: "Entries", color: "#1d4ed8" }, { name: "Exits", color: "#0e9bdb" }]} />}
              />
              <div className="px-3 pb-3 pt-4">
                {hourlyData.length > 0 ? (
                  <LineAreaChart
                    height={240}
                    series={[
                      { name: "Entries", color: "#1d4ed8", points: hourlyData.map((d) => ({ x: d.x, y: d.entries })), area: true },
                      { name: "Exits", color: "#0e9bdb", points: hourlyData.map((d) => ({ x: d.x, y: d.exits })) },
                    ]}
                  />
                ) : (
                  <EmptyState icon={<Clock size={20} />} title="No movement recorded" body="Vehicle entries and exits will appear here as attendants process them." />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Revenue by payment method" subtitle={`Total ${fmtMoney(analytics.kpis.rangeRevenueTotal)} in range`} />
              <div className="px-5 pb-6 pt-5">
                {analytics.charts.revenueByMethod.length > 0 ? (
                  <DonutChart
                    data={analytics.charts.revenueByMethod.map((m, i) => ({
                      label: m.method.replace(/_/g, " "),
                      value: m.total,
                      color: PALETTE[i % PALETTE.length],
                    }))}
                    format={(v) => fmtMoney(v)}
                    centerLabel="Range total"
                  />
                ) : (
                  <EmptyState icon={<Banknote size={20} />} title="No payments in range" body="Collected revenue will show here once exits are settled." />
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Revenue over time" subtitle="Daily collected payments" />
              <div className="px-3 pb-3 pt-4">
                {analytics.charts.revenueByDay.length > 0 ? (
                  <BarsChart
                    height={220}
                    data={analytics.charts.revenueByDay.map((d) => ({ label: dayLabel(d.day), value: d.total }))}
                    format={(v) => fmtMoney(v)}
                  />
                ) : (
                  <EmptyState icon={<TrendingUp size={20} />} title="No revenue yet" body="Complete an exit with payment to see revenue trend." />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Occupancy over time" subtitle="Spaces in use per day" />
              <div className="px-3 pb-3 pt-4">
                {analytics.charts.occupancyByDay.length > 0 ? (
                  <LineAreaChart
                    height={220}
                    series={[{ name: "Occupied", color: "#0d9488", points: analytics.charts.occupancyByDay.map((d) => ({ x: dayLabel(d.day), y: d.occupied })), area: true }]}
                  />
                ) : (
                  <EmptyState icon={<CircleParking size={20} />} title="No occupancy history" body="Historical utilization appears after the first sessions." />
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Utilization by zone" subtitle="Occupied spaces per zone" />
              <div className="px-5 pb-5 pt-4">
                {analytics.charts.zones.length > 0 ? (
                  <HBarChart
                    data={analytics.charts.zones.map((z) => ({
                      label: `${z.code} · ${z.name}`,
                      sub: z.floor != null ? `F${z.floor}` : undefined,
                      value: z.occupied,
                      hint: `/ ${z.capacity}`,
                      color: "var(--primary)",
                    }))}
                  />
                ) : (
                  <EmptyState icon={<LayoutGrid size={20} />} title="No zones yet" body="Create zones and spaces to see utilization." />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Vehicle distribution" subtitle="Sessions by vehicle type in range" />
              <div className="px-5 pb-5 pt-4">
                {analytics.charts.vehicleTypes.length > 0 ? (
                  <DonutChart
                    data={analytics.charts.vehicleTypes.slice(0, 6).map((v, i) => ({
                      label: v.type,
                      value: v.count,
                      color: PALETTE[(i + 2) % PALETTE.length],
                    }))}
                    centerLabel="Sessions"
                  />
                ) : (
                  <EmptyState icon={<Car size={20} />} title="No sessions in range" body="Vehicle mix appears once traffic is recorded." />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Subscription vs casual" subtitle="Revenue split in range" />
              <div className="px-5 pb-5 pt-4">
                {analytics.kpis.rangeRevenueTotal > 0 ? (
                  <DonutChart
                    data={[
                      { label: "Subscription holders", value: analytics.charts.subscriptionRevenue, color: "#7c3aed" },
                      { label: "Casual parking", value: analytics.charts.casualRevenue, color: "#1d4ed8" },
                    ]}
                    format={(v) => fmtMoney(v)}
                    centerLabel="Revenue"
                  />
                ) : (
                  <EmptyState icon={<CreditCard size={20} />} title="No revenue in range" body="The split appears once payments are collected." />
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ---------------------------- live map ------------------------------ */}
      <Card>
        <CardHeader
          icon={<LayoutGrid size={16} />}
          title="Live facility map"
          subtitle={floorMap ? `${floorMap.totals.occupied}/${floorMap.totals.capacity} occupied · synced ${relativeTime(floorMap.generatedAt)}` : "Loading…"}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  value={mapFilters.q}
                  onChange={(e) => setMapFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Plate or space…"
                  aria-label="Filter spaces by plate or number"
                  className="h-8.5 w-[130px] rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] pl-7 pr-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <Select value={mapFilters.zone} onChange={(e) => setMapFilters((f) => ({ ...f, zone: e.target.value }))} className="h-8.5 w-[150px] text-xs" aria-label="Filter by zone">
                <option value="">All zones</option>
                {zoneOptions.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </Select>
              <Select value={mapFilters.floor} onChange={(e) => setMapFilters((f) => ({ ...f, floor: e.target.value }))} className="h-8.5 w-[110px] text-xs" aria-label="Filter by floor">
                <option value="">All floors</option>
                {floors.map((f) => (
                  <option key={f} value={String(f)}>{f === 0 ? "Ground" : `Floor ${f}`}</option>
                ))}
              </Select>
              <Select value={mapFilters.status} onChange={(e) => setMapFilters((f) => ({ ...f, status: e.target.value }))} className="h-8.5 w-[120px] text-xs" aria-label="Filter by status">
                <option value="">Any status</option>
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="reserved">Reserved</option>
                <option value="maintenance">Maintenance</option>
              </Select>
            </div>
          }
        />
        <div className="px-5 pb-4 pt-3">
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] font-medium text-[var(--text-secondary)]">
            <LegendDot cls="pk-space--available" label="Available" />
            <LegendDot cls="pk-space--occupied" label="Occupied" />
            <LegendDot cls="pk-space--reserved" label="Reserved" />
            <LegendDot cls="pk-space--maintenance" label="Maintenance" />
          </div>

          {!floorMap && !floorError && (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-12">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          )}
          {floorMap && filteredZones.length === 0 && (
            <EmptyState
              icon={<LayoutGrid size={20} />}
              title="No facility layout yet"
              body="Create a site, zones and spaces to see the live map."
              action={
                <Link href="/dashboard/membership/parking/spaces">
                  <Button size="sm">Set up facility</Button>
                </Link>
              }
            />
          )}
          {floorMap &&
            filteredZones.map((z) => (
              <div key={z.id} className="mb-5 last:mb-1">
                <div className="mb-2 flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                    {z.code} — {z.name}
                  </span>
                  {z.floor != null && z.floor > 0 && <Badge tone="neutral">Floor {z.floor}</Badge>}
                  <Badge tone={z.occupancyPct >= 90 ? "danger" : z.occupancyPct >= 70 ? "warning" : "success"}>
                    {z.occupied}/{z.capacity} occupied
                  </Badge>
                  <Progress value={z.capacity ? (z.occupied / z.capacity) * 100 : 0} tone={z.occupancyPct >= 90 ? "danger" : z.occupancyPct >= 70 ? "warning" : "success"} className="max-w-[130px]" />
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14">
                  {z.slots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSlot(s)}
                      className={cn("pk-space", `pk-space--${s.status}`)}
                      aria-label={`Space ${s.slot_number}: ${s.status}${s.plate_number ? `, plate ${s.plate_number}` : ""}`}
                    >
                      <span>{s.slot_number.replace(/[A-Za-z]+-/, "")}</span>
                      {s.status === "occupied" && s.plate_number && (
                        <span className="w-full truncate px-0.5 text-[8.5px] font-semibold opacity-80">{s.plate_number}</span>
                      )}
                      {s.status === "maintenance" && <Wrench size={10} aria-hidden />}
                      {s.status === "reserved" && <span className="text-[8px] font-bold uppercase tracking-wide">R</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* --------------------------- recent activity ------------------------- */}
      <Card>
        <CardHeader
          icon={<Clock size={16} />}
          title="Recent activity"
          subtitle="Latest sessions across all gates"
          actions={
            <Link href="/dashboard/membership/parking/sessions" className="text-[13px] font-semibold text-[var(--primary)] hover:underline">
              View all sessions
            </Link>
          }
        />
        {analytics && (
          <DataTable
            columns={[
              {
                key: "plate", label: "Plate", render: (r) => (
                  <span className="font-semibold">{r.plate_number || "—"}</span>
                ),
              },
              { key: "ticket_number", label: "Ticket", className: "pk-num text-[var(--text-secondary)]", hideBelow: "md" },
              { key: "zone", label: "Space", render: (r) => (r.zone_name ? `${r.zone_name}${r.slot_number ? ` · ${r.slot_number}` : ""}` : "—"), hideBelow: "sm" },
              { key: "type", label: "Type", render: (r) => <Badge tone="neutral">{r.vehicle_type || "—"}</Badge>, hideBelow: "md" },
              { key: "entry", label: "Entry", render: (r) => <span title={fmtDateTime(r.entry_time)}>{relativeTime(r.entry_time)}</span> },
              { key: "amount", label: "Fee", align: "right", render: (r) => (r.status === "active" ? "—" : fmtMoney(r.amount)) },
              {
                key: "status", label: "Status", align: "center", render: (r) => (
                  <Badge tone={r.status === "active" ? (r.payment_status === "unpaid" ? "warning" : "success") : r.status === "completed" ? "primary" : "neutral"} dot>
                    {r.status === "active" ? r.payment_status === "unpaid" ? "inside · unpaid" : "inside · paid" : r.status}
                  </Badge>
                ),
              },
            ]}
            rows={analytics.recent}
            rowKey={(r) => r.id}
          />
        )}
      </Card>

      {/* --------------------------- space detail ---------------------------- */}
      <Dialog
        open={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
        title={`Space ${selectedSlot?.slot_number ?? ""}`}
        subtitle={selectedSlot ? `${selectedSlot.type} space${selectedSlot.floor != null ? ` · floor ${selectedSlot.floor}` : ""}` : undefined}
        size="sm"
        footer={
          selectedSlot?.status === "occupied" && selectedSlot.ticket_number ? (
            <>
              <Link href={`/dashboard/membership/parking/sessions?q=${encodeURIComponent(selectedSlot.ticket_number)}`} onClick={() => setSelectedSlot(null)}>
                <Button variant="outline" size="sm">View session</Button>
              </Link>
              <Link href={`/dashboard/membership/parking/exit?mode=cashier&q=${encodeURIComponent(selectedSlot.plate_number || selectedSlot.ticket_number || "")}`} onClick={() => setSelectedSlot(null)}>
                <Button variant="success" size="sm">Process exit</Button>
              </Link>
            </>
          ) : selectedSlot?.status === "available" ? (
            <>
              <Link href={`/dashboard/membership/parking/entry?slot=${selectedSlot.id}&zone=${selectedSlot.zone_id}`} onClick={() => setSelectedSlot(null)}>
                <Button size="sm">Start entry here</Button>
              </Link>
            </>
          ) : undefined
        }
      >
        {selectedSlot && (
          <div className="space-y-3 text-[13.5px]">
            <div className="flex items-center gap-2">
              <Badge tone={selectedSlot.status === "occupied" ? "primary" : selectedSlot.status === "available" ? "success" : selectedSlot.status === "reserved" ? "purple" : "warning"} dot>
                {selectedSlot.status}
              </Badge>
              {selectedSlot.type !== "standard" && <Badge tone="neutral">{selectedSlot.type}</Badge>}
            </div>
            {selectedSlot.status === "occupied" ? (
              <dl className="space-y-2.5">
                <Row label="Plate"><span className="text-base font-bold">{selectedSlot.plate_number || "Unknown"}</span></Row>
                <Row label="Vehicle">{selectedSlot.vehicle_type ? <span className="capitalize">{selectedSlot.vehicle_type}</span> : "—"}</Row>
                <Row label="Owner / customer">{selectedSlot.owner_name || "—"}</Row>
                <Row label="Ticket"><span className="pk-num">{selectedSlot.ticket_number}</span></Row>
                <Row label="Entered">{fmtDateTime(selectedSlot.entry_time)} <span className="text-[var(--text-tertiary)]">({relativeTime(selectedSlot.entry_time)})</span></Row>
                <Row label="Parked for">{fmtDuration(selectedSlot.minutes_parked)}</Row>
              </dl>
            ) : selectedSlot.status === "maintenance" ? (
              <p className="text-[var(--text-secondary)]">This space is closed for maintenance and cannot accept vehicles.</p>
            ) : (
              <p className="text-[var(--text-secondary)]">This space is free and ready for the next vehicle.</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--card-border)] pb-2 last:border-0">
      <dt className="shrink-0 text-[var(--text-tertiary)]">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

function Legend({ items }: { items: Array<{ name: string; color: string }> }) {
  return (
    <div className="flex items-center gap-4">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text-secondary)]">
          <span className="h-1.5 w-4 rounded-full" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("pk-space h-4 w-6 min-h-0 cursor-default p-0 hover:shadow-none", cls)} />
      {label}
    </span>
  );
}

function Kpi({
  label, value, sub, icon, tone, href, trend, progress, hideSubWhenEmpty,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "warning" | "danger" | "purple" | "neutral";
  href: string;
  trend?: { current: number; previous: number };
  progress?: number;
  hideSubWhenEmpty?: boolean;
}) {
  const toneColors: Record<string, string> = {
    primary: "var(--primary)",
    success: "var(--accent-green)",
    warning: "var(--accent-amber)",
    danger: "var(--accent-red)",
    purple: "var(--accent-purple)",
    neutral: "var(--text-tertiary)",
  };
  const showSub = sub && !(hideSubWhenEmpty && sub === "");
  return (
    <Link href={href} className="group block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label={`${label}: ${value}`}>
      <Card hover className="h-full p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
            style={{ background: "color-mix(in srgb, " + toneColors[tone] + " 12%, transparent)", color: toneColors[tone] }}
          >
            {icon}
          </span>
        </div>
        <p className="pk-num mt-2 text-[22px] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">{value}</p>
        {progress != null ? <Progress value={progress} tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "success"} className="mt-2" /> : null}
        <div className="mt-1.5 flex min-h-[16px] items-center gap-2">
          {trend && <TrendPill current={trend.current} previous={trend.previous} />}
          {showSub && <span className="truncate text-[11px] text-[var(--text-tertiary)]">{sub}</span>}
        </div>
      </Card>
    </Link>
  );
}
