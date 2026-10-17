"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Download, Printer, RefreshCw } from "lucide-react";
import {
  Badge, Button, Card, CardHeader, DataTable, DateRangeInput, EmptyState, Input, Select,
  Skeleton, cn, fmtDuration, fmtInt, fmtMoney, type Column,
} from "@/lib/ui";
import { apiGet } from "@/lib/client";

type ReportType =
  | "revenue" | "entries" | "occupancy" | "duration" | "vehicles" | "cashier"
  | "methods" | "outstanding" | "adjustments" | "zones" | "subscriptions";

const REPORTS: Array<{ type: ReportType; label: string; description: string }> = [
  { type: "revenue", label: "Revenue", description: "Daily collections split by cash and digital" },
  { type: "entries", label: "Entries & exits", description: "Daily movement and average duration" },
  { type: "occupancy", label: "Occupancy", description: "Spaces in use per day per zone" },
  { type: "duration", label: "Parking duration", description: "Stay-length distribution and revenue per bucket" },
  { type: "vehicles", label: "Vehicle mix", description: "Sessions and revenue by vehicle type" },
  { type: "cashier", label: "Cashier shifts", description: "Collections per operator per day" },
  { type: "methods", label: "Payment methods", description: "Share of revenue by channel" },
  { type: "outstanding", label: "Outstanding", description: "Unpaid active sessions" },
  { type: "adjustments", label: "Discounts & refunds", description: "Manual adjustments with authorship" },
  { type: "zones", label: "Zone performance", description: "Sessions, revenue and utilization per zone" },
  { type: "subscriptions", label: "Subscriptions", description: "Membership periods and remaining days" },
];

type ReportRow = Record<string, any>;

const COLS: Record<ReportType, Column<ReportRow>[]> = {
  revenue: [
    { key: "day", label: "Day" },
    { key: "transactions", label: "Transactions", align: "right", render: (r) => fmtInt(r.transactions) },
    { key: "cash", label: "Cash", align: "right", render: (r) => fmtMoney(r.cash) },
    { key: "digital", label: "Digital", align: "right", render: (r) => fmtMoney(r.digital) },
    { key: "total", label: "Total", align: "right", render: (r) => <strong className="pk-num">{fmtMoney(r.total)}</strong> },
  ],
  entries: [
    { key: "day", label: "Day" },
    { key: "entries", label: "Entries", align: "right", render: (r) => fmtInt(r.entries) },
    { key: "exits", label: "Exits", align: "right", render: (r) => fmtInt(r.exits) },
    { key: "still_inside", label: "Still inside", align: "right", render: (r) => fmtInt(r.still_inside) },
    { key: "avg_duration_min", label: "Avg duration", align: "right", render: (r) => fmtDuration(r.avg_duration_min) },
  ],
  occupancy: [
    { key: "day", label: "Day" },
    { key: "zone", label: "Zone" },
    { key: "floor", label: "Floor", align: "center", render: (r) => (r.floor != null ? r.floor : "—") },
    { key: "capacity", label: "Capacity", align: "right", render: (r) => fmtInt(r.capacity) },
    { key: "occupied_sessions", label: "In use", align: "right", render: (r) => fmtInt(r.occupied_sessions) },
    { key: "pct", label: "Utilization", align: "right", render: (r) => (r.capacity > 0 ? `${Math.round((r.occupied_sessions / r.capacity) * 100)}%` : "—") },
  ],
  duration: [
    { key: "bucket", label: "Duration bucket" },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtInt(r.sessions) },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue) },
  ],
  vehicles: [
    { key: "vehicle_type", label: "Type", render: (r) => <Badge tone="neutral">{r.vehicle_type}</Badge> },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtInt(r.sessions) },
    { key: "distinct_vehicles", label: "Distinct vehicles", align: "right", hideBelow: "md", render: (r) => fmtInt(r.distinct_vehicles) },
    { key: "avg_duration_min", label: "Avg duration", align: "right", render: (r) => fmtDuration(r.avg_duration_min) },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => fmtMoney(r.revenue) },
  ],
  cashier: [
    { key: "operator", label: "Operator" },
    { key: "day", label: "Day" },
    { key: "transactions", label: "Transactions", align: "right", render: (r) => fmtInt(r.transactions) },
    { key: "cash", label: "Cash", align: "right", render: (r) => fmtMoney(r.cash) },
    { key: "digital", label: "Digital", align: "right", render: (r) => fmtMoney(r.digital) },
    { key: "collected", label: "Collected", align: "right", render: (r) => <strong className="pk-num">{fmtMoney(r.collected)}</strong> },
  ],
  methods: [
    { key: "payment_method", label: "Method", render: (r) => <span className="capitalize">{String(r.payment_method).replace(/_/g, " ")}</span> },
    { key: "transactions", label: "Transactions", align: "right", render: (r) => fmtInt(r.transactions) },
    { key: "total", label: "Total", align: "right", render: (r) => <strong className="pk-num">{fmtMoney(r.total)}</strong> },
    { key: "share_pct", label: "Share", align: "right", render: (r) => `${r.share_pct ?? 0}%` },
  ],
  outstanding: [
    { key: "ticket_number", label: "Ticket", render: (r) => <span className="pk-num font-semibold">{r.ticket_number}</span> },
    { key: "plate_number", label: "Plate" },
    { key: "entry_time", label: "Entered" },
    { key: "hours_parked", label: "Parked", align: "right", render: (r) => `${r.hours_parked}h` },
    { key: "zone", label: "Space", hideBelow: "md", render: (r) => (r.zone ? `${r.zone}${r.slot_number ? ` · ${r.slot_number}` : ""}` : "—") },
    { key: "amount_due", label: "Due", align: "right", render: (r) => <strong className="pk-num text-[var(--accent-amber)]">{fmtMoney(r.amount_due)}</strong> },
  ],
  adjustments: [
    { key: "date", label: "When" },
    { key: "kind", label: "Kind", render: (r) => <Badge tone={r.kind === "refund" ? "warning" : "info"}>{r.kind}</Badge> },
    { key: "ticket_number", label: "Ticket", hideBelow: "md", render: (r) => r.ticket_number || "—" },
    { key: "code", label: "Code", hideBelow: "lg", render: (r) => r.code || "—" },
    { key: "amount", label: "Amount", align: "right", render: (r) => <strong className="pk-num">{fmtMoney(r.amount)}</strong> },
    { key: "reason", label: "Reason", hideBelow: "lg", render: (r) => r.reason || "—" },
    { key: "operator", label: "By", hideBelow: "md", render: (r) => r.operator || "—" },
  ],
  zones: [
    { key: "zone", label: "Zone" },
    { key: "code", label: "Code" },
    { key: "floor", label: "Floor", align: "center", render: (r) => (r.floor != null ? r.floor : "—") },
    { key: "capacity", label: "Capacity", align: "right", render: (r) => fmtInt(r.capacity) },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => fmtInt(r.sessions) },
    { key: "avg_duration_min", label: "Avg duration", align: "right", render: (r) => fmtDuration(r.avg_duration_min) },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => <strong className="pk-num">{fmtMoney(r.revenue)}</strong> },
  ],
  subscriptions: [
    { key: "customer", label: "Customer" },
    { key: "plate_number", label: "Plate", render: (r) => r.plate_number || "—" },
    { key: "plan_type", label: "Plan", render: (r) => <Badge tone="neutral" className="capitalize">{r.plan_type}</Badge> },
    { key: "period", label: "Period", hideBelow: "md", render: (r) => <span className="pk-num">{r.start_date} → {r.end_date}</span> },
    { key: "amount", label: "Amount", align: "right", render: (r) => fmtMoney(r.amount) },
    { key: "days_remaining", label: "Remaining", align: "center", render: (r) => (r.days_remaining > 0 ? `${r.days_remaining}d` : <Badge tone="danger">expired</Badge>) },
    { key: "status", label: "Status", align: "center", render: (r) => <Badge tone={r.status === "active" ? "success" : "neutral"} dot>{r.status}</Badge> },
  ],
};

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="pk-spinner" /></div>}>
      <ReportsCenter />
    </Suspense>
  );
}

function ReportsCenter() {
  const params = useSearchParams();
  const [type, setType] = useState<ReportType>((params.get("type") as ReportType) || "revenue");
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = REPORTS.find((r) => r.type === type)!;

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const sp = new URLSearchParams({ type, from, to });
      if (method) sp.set("method", method);
      const res = await apiGet<{ rows: ReportRow[] }>(`/api/membership/parking/reports?${sp}`);
      setRows(res.rows);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
  }, [type, from, to, method]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    if (!rows) return null;
    if (type === "revenue") return { label: "Total collected", value: fmtMoney(rows.reduce((a, r) => a + Number(r.total || 0), 0)) };
    if (type === "methods") return { label: "Total", value: fmtMoney(rows.reduce((a, r) => a + Number(r.total || 0), 0)) };
    if (type === "outstanding") return { label: "Total outstanding", value: fmtMoney(rows.reduce((a, r) => a + Number(r.amount_due || 0), 0)) };
    if (type === "adjustments") return { label: "Total adjustments", value: fmtMoney(rows.reduce((a, r) => a + Number(r.amount || 0), 0)) };
    if (type === "duration" || type === "vehicles" || type === "zones") return { label: "Revenue", value: fmtMoney(rows.reduce((a, r) => a + Number(r.revenue || 0), 0)) };
    if (type === "cashier") return { label: "Collected", value: fmtMoney(rows.reduce((a, r) => a + Number(r.collected || 0), 0)) };
    if (type === "subscriptions") return { label: "Subscriptions", value: fmtInt(rows.length) };
    if (type === "entries") return { label: "Total entries", value: fmtInt(rows.reduce((a, r) => a + Number(r.entries || 0), 0)) };
    if (type === "occupancy") return { label: "Zone-days", value: fmtInt(rows.length) };
    return null;
  }, [rows, type]);

  const exportCsv = () => {
    if (!rows?.length) return;
    const cols = COLS[type].filter((c) => c.key !== "actions");
    const header = cols.map((c) => (typeof c.label === "string" ? c.label : c.key));
    const lines = rows.map((r) => cols.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${type}-${from}-to-${to}.csv`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Reports</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">{meta.description} — same data and business rules as operations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="md" icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
          <Button variant="outline" size="md" icon={<Download size={14} />} onClick={exportCsv} disabled={!rows?.length}>Export CSV</Button>
          <Button variant="outline" size="md" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
        </div>
      </div>

      {/* report picker */}
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.type}
            onClick={() => setType(r.type)}
            aria-pressed={type === r.type}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              type === r.type
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--card-border)] px-5 py-4">
          <DateRangeInput from={from} to={to} onFrom={setFrom} onTo={setTo} />
          {type === "revenue" && (
            <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-[160px]" aria-label="Payment method filter">
              <option value="">All methods</option>
              {["cash", "telebirr", "cbebirr", "chapa", "addispay", "bank", "pos"].map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          )}
          {totals && (
            <div className="ml-auto text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{totals.label}</p>
              <p className="pk-num text-lg font-bold text-[var(--text-primary)]">{totals.value}</p>
            </div>
          )}
        </div>

        {error ? (
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-[13px] text-[var(--accent-red)]">Report failed — {error}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        ) : !rows ? (
          <div className="space-y-3 p-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : (
          <DataTable columns={COLS[type]} rows={rows} rowKey={(_, i) => i} loading={false}
            empty={<EmptyState icon={<BarChart3 size={20} />} title="No data for this period" body="Adjust the date range or pick another report." />}
          />
        )}
      </Card>
    </div>
  );
}
