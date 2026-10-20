"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Clock, Download, Eye, RefreshCw } from "lucide-react";
import {
  Badge, Button, Card, DataTable, DateRangeInput, Dialog, Dropdown, DropdownItem,
  EmptyState, Pagination, Select, Input, fmtDateTime, fmtDuration, fmtMoney, relativeTime, type Column,
} from "@/lib/ui";
import { apiGet } from "@/lib/client";

interface SessionRow {
  id: number;
  ticket_number: string;
  plate_number: string | null;
  vehicle_plate?: string | null;
  vehicle_type?: string | null;
  owner_name?: string | null;
  customer_name?: string | null;
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  zone_name?: string | null;
  slot_number?: string | null;
  amount: string | number | null;
  payment_status: string;
  status: string;
  entry_gate_name?: string | null;
  ticket?: string | null;
}

const PAGE_SIZE = 25;

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="pk-spinner" /></div>}>
      <SessionsBrowser />
    </Suspense>
  );
}

function SessionsBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") || "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [status, setStatus] = useState(params.get("status") || "");
  const [payment, setPayment] = useState(params.get("payment_status") || "");
  const [zoneId, setZoneId] = useState("");
  const [zones, setZones] = useState<Array<{ id: number; name: string; code: string }>>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "entry_time", dir: "desc" });
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionRow | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    apiGet<Array<{ id: number; name: string; code: string }>>("/api/membership/parking/zones?limit=200")
      .then(setZones)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (debouncedQ) sp.set("q", debouncedQ);
      if (status) sp.set("status", status);
      if (payment) sp.set("payment_status", payment);
      if (zoneId) sp.set("zone_id", zoneId);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      sp.set("sort", sort.key);
      sp.set("dir", sort.dir);
      sp.set("page", String(page));
      sp.set("page_size", String(PAGE_SIZE));
      const res = await apiGet<{ rows: SessionRow[]; total: number }>(`/api/membership/parking/sessions?${sp.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, status, payment, zoneId, from, to, sort, page]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, payment, zoneId, from, to]);

  const exportCsv = useCallback(() => {
    if (!rows) return;
    const header = ["Ticket", "Plate", "Type", "Customer", "Entry", "Exit", "Duration (min)", "Zone", "Space", "Fee", "Payment", "Status"];
    const lines = rows.map((r) =>
      [
        r.ticket_number, r.plate_number ?? r.vehicle_plate ?? "", r.vehicle_type ?? "", r.customer_name ?? r.owner_name ?? "",
        r.entry_time, r.exit_time ?? "", r.duration_minutes ?? "", r.zone_name ?? "", r.slot_number ?? "",
        r.amount ?? 0, r.payment_status, r.status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parking-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  const allColumns: Column<SessionRow>[] = useMemo(
    () => [
      {
        key: "ticket_number", label: "Ticket", sortable: true,
        render: (r) => <span className="pk-num font-semibold text-[var(--text-primary)]">{r.ticket_number}</span>,
      },
      {
        key: "plate_number", label: "Plate", sortable: true,
        render: (r) => (
          <button className="font-semibold text-[var(--primary)] hover:underline" onClick={(e) => { e.stopPropagation(); setQ(r.plate_number || r.vehicle_plate || ""); }} title="Filter by this plate">
            {r.plate_number || r.vehicle_plate || "—"}
          </button>
        ),
      },
      { key: "vehicle_type", label: "Type", hideBelow: "md", render: (r) => <Badge tone="neutral">{r.vehicle_type || "—"}</Badge> },
      { key: "customer", label: "Customer", hideBelow: "lg", render: (r) => r.customer_name || r.owner_name || "—" },
      { key: "entry_time", label: "Entry", sortable: true, render: (r) => <span title={fmtDateTime(r.entry_time)}>{relativeTime(r.entry_time)}</span> },
      {
        key: "duration", label: "Duration", hideBelow: "sm",
        render: (r) => (r.status === "active" && r.entry_time ? fmtDuration((Date.now() - new Date(r.entry_time).getTime()) / 60000) : fmtDuration(r.duration_minutes)),
      },
      { key: "space", label: "Space", hideBelow: "md", render: (r) => (r.zone_name ? `${r.zone_name}${r.slot_number ? ` · ${r.slot_number}` : ""}` : "—") },
      { key: "amount", label: "Fee", align: "right", sortable: true, render: (r) => (r.status === "active" ? <span className="text-[var(--text-tertiary)]">—</span> : fmtMoney(r.amount)) },
      {
        key: "payment_status", label: "Payment", align: "center",
        render: (r) => (
          <Badge tone={r.payment_status === "paid" ? "success" : r.status === "active" ? "warning" : "danger"} dot>
            {r.payment_status}
          </Badge>
        ),
      },
      {
        key: "status", label: "Status", align: "center", sortable: true,
        render: (r) => (
          <Badge tone={r.status === "active" ? "primary" : r.status === "completed" ? "success" : r.status === "cancelled" ? "danger" : "neutral"} dot>
            {r.status === "active" ? "inside" : r.status}
          </Badge>
        ),
      },
      {
        key: "actions", label: "", align: "right", render: (r) => (
          <Dropdown
            trigger={
              <button aria-label={`Actions for ${r.ticket_number}`} className="rounded-lg px-2 py-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
                ⋯
              </button>
            }
          >
            {(close) => (
              <>
                <DropdownItem icon={<Eye size={14} />} onClick={() => { setDetail(r); close(); }}>View details</DropdownItem>
                {r.status === "active" && (
                  <DropdownItem
                    icon={<Clock size={14} />}
                    onClick={() => { router.push(`/dashboard/membership/parking/exit?mode=cashier&q=${encodeURIComponent(r.ticket_number)}`); }}
                  >
                    Process exit
                  </DropdownItem>
                )}
              </>
            )}
          </Dropdown>
        ),
      },
    ],
    []
  );

  const visibleColumns = allColumns.filter((c) => !hiddenCols.has(c.key));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Parking Sessions</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Every stay — live, completed and cancelled. {total > 0 && `${total} matching records.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            trigger={
              <Button variant="outline" size="md" icon={<Eye size={14} />}>Columns</Button>
            }
          >
            {allColumns.filter((c) => c.key !== "actions").map((c) => (
              <DropdownItem
                key={c.key}
                onClick={() =>
                  setHiddenCols((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    return next;
                  })
                }
              >
                <span className="flex w-full items-center gap-2">
                  <input type="checkbox" readOnly checked={!hiddenCols.has(c.key)} className="pointer-events-none" />
                  {c.label}
                </span>
              </DropdownItem>
            ))}
          </Dropdown>
          <Button variant="outline" size="md" icon={<Download size={14} />} onClick={exportCsv} disabled={!rows || rows.length === 0}>
            Export CSV
          </Button>
          <Button variant="outline" size="md" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--card-border)] px-5 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search plate, ticket, customer…"
              aria-label="Search sessions"
              className="pl-9"
            />
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[150px]" aria-label="Session status filter">
            <option value="">Any status</option>
            <option value="active">Inside now</option>
            <option value="completed">Completed</option>
            <option value="pending_payment">Pending payment</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="w-[150px]" aria-label="Payment status filter">
            <option value="">Any payment</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </Select>
          <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-[160px]" aria-label="Zone filter">
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z.id} value={String(z.id)}>{z.code} — {z.name}</option>
            ))}
          </Select>
          <DateRangeInput from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-[13px] font-medium text-[var(--accent-red)]">Failed to load sessions — {error}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        ) : (
          <>
            <DataTable
              columns={visibleColumns}
              rows={rows}
              loading={loading}
              rowKey={(r) => r.id}
              sort={sort}
              onSortChange={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
              onRowClick={(r) => setDetail(r)}
              empty={
                <EmptyState
                  icon={<Clock size={20} />}
                  title="No sessions match these filters"
                  body="Adjust the search, status or date range — or process a vehicle entry to create the first session."
                  action={
                    <Link href="/dashboard/membership/parking/entry">
                      <Button size="sm">Open Vehicle Entry</Button>
                    </Link>
                  }
                />
              }
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Card>

      {/* detail dialog */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `Session ${detail.ticket_number}` : ""} size="md"
        footer={
          detail?.status === "active" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              <Link href={`/dashboard/membership/parking/exit?mode=cashier&q=${encodeURIComponent(detail.ticket_number)}`} onClick={() => setDetail(null)}>
                <Button variant="success" size="sm">Process exit</Button>
              </Link>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
          )
        }
      >
        {detail && (
          <div className="space-y-3 text-[13.5px]">
            <div className="flex flex-wrap gap-2">
              <Badge tone={detail.status === "active" ? "primary" : "success"} dot>{detail.status}</Badge>
              <Badge tone={detail.payment_status === "paid" ? "success" : "warning"}>{detail.payment_status}</Badge>
              {detail.vehicle_type && <Badge tone="neutral">{detail.vehicle_type}</Badge>}
            </div>
            <dl>
              {[
                ["Plate", detail.plate_number || detail.vehicle_plate || "—"],
                ["Customer", detail.customer_name || detail.owner_name || "—"],
                ["Entry", fmtDateTime(detail.entry_time)],
                ["Exit", detail.exit_time ? fmtDateTime(detail.exit_time) : "still inside"],
                ["Duration", detail.status === "active" ? fmtDuration((Date.now() - new Date(detail.entry_time).getTime()) / 60000) : fmtDuration(detail.duration_minutes)],
                ["Space", detail.zone_name ? `${detail.zone_name}${detail.slot_number ? ` · ${detail.slot_number}` : ""}` : "—"],
                ["Entry gate", detail.entry_gate_name || "—"],
                ["Fee", detail.status === "active" ? "settled at exit" : fmtMoney(detail.amount)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-baseline justify-between gap-4 border-b border-[var(--card-border)] py-2 last:border-0">
                  <dt className="text-[var(--text-tertiary)]">{k}</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Dialog>
    </div>
  );
}
