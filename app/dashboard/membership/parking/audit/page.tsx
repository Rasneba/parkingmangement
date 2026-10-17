"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import {
  Badge, Button, Card, CardHeader, DataTable, DateRangeInput, Dialog, EmptyState, Pagination,
  Select, fmtDateTime, relativeTime, type Column,
} from "@/lib/ui";
import { apiGet } from "@/lib/client";

interface AuditRow {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  description: string | null;
  user_email: string | null;
  ip_address: string | null;
  old_values: any;
  new_values: any;
  created_at: string;
}

const PAGE_SIZE = 30;

const ACTION_TONES: Record<string, "success" | "warning" | "danger" | "info" | "primary" | "neutral"> = {
  ENTRY: "primary", EXIT: "info", PAYMENT: "success", REFUND: "warning", DISCOUNT: "warning",
  DELETE: "danger", REJECT: "danger", SHIFT_OPEN: "neutral", SHIFT_CLOSE: "neutral",
  CREATE: "success", UPDATE: "info", APPROVE: "success", LOGIN: "neutral", EXPORT: "neutral",
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const sp = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (action) sp.set("action", action);
      if (entity) sp.set("entity", entity);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      const res = await apiGet<{ rows: AuditRow[]; total: number }>(`/api/membership/parking/audit-logs?${sp}`);
      setRows(res.rows);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
  }, [page, action, entity, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    if (!rows) return;
    const header = ["When", "Action", "Entity", "Entity ID", "Description", "User", "IP"];
    const lines = rows.map((r) => [r.created_at, r.action, r.entity, r.entity_id ?? "", r.description ?? "", r.user_email ?? "", r.ip_address ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `parking-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const columns: Column<AuditRow>[] = [
    { key: "created_at", label: "When", render: (r) => <span title={fmtDateTime(r.created_at)}>{relativeTime(r.created_at)}</span> },
    { key: "action", label: "Action", render: (r) => <Badge tone={ACTION_TONES[r.action] ?? "neutral"} dot>{r.action}</Badge> },
    { key: "entity", label: "Entity", render: (r) => <span className="capitalize">{String(r.entity).replace(/_/g, " ")}{r.entity_id ? ` #${r.entity_id}` : ""}</span> },
    { key: "description", label: "Description", render: (r) => <span className="pk-truncate-1 max-w-[380px] text-[var(--text-secondary)]">{r.description || "—"}</span> },
    { key: "user_email", label: "User", hideBelow: "md", render: (r) => r.user_email || "system" },
    { key: "ip", label: "IP", hideBelow: "lg", render: (r) => <span className="pk-num text-[var(--text-tertiary)]">{r.ip_address || "—"}</span> },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Audit Log</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Every sensitive operation — entries, exits, payments, refunds, overrides, tariff changes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="md" icon={<Download size={14} />} onClick={exportCsv} disabled={!rows?.length}>Export CSV</Button>
          <Button variant="outline" size="md" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--card-border)] px-5 py-4">
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-[160px]" aria-label="Action filter">
            <option value="">All actions</option>
            {["ENTRY", "EXIT", "PAYMENT", "REFUND", "DISCOUNT", "CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "SHIFT_OPEN", "SHIFT_CLOSE"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="w-[190px]" aria-label="Entity filter">
            <option value="">All entities</option>
            {["parking_session", "parking_payment", "parking_refund", "parking_discount", "parking_rate", "parking_slot", "parking_zone", "parking_site", "parking_device", "parking_shift", "parking_shift_movement", "parking_subscription"].map((e) => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </Select>
          <DateRangeInput from={from} to={to} onFrom={(v) => { setFrom(v); setPage(1); }} onTo={(v) => { setTo(v); setPage(1); }} />
        </div>

        {error ? (
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-[13px] text-[var(--accent-red)]">{error}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              loading={!rows}
              rowKey={(r) => r.id}
              onRowClick={setDetail}
              empty={<EmptyState icon={<ShieldCheck size={20} />} title="No audit records" body="Sensitive operations will appear here automatically." />}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Card>

      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.action} — ${String(detail.entity).replace(/_/g, " ")}` : ""} size="md"
        footer={<Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-3 text-[13px]">
            <p className="text-[var(--text-secondary)]">{detail.description || "—"}</p>
            <div className="grid grid-cols-2 gap-2 text-[12.5px] text-[var(--text-tertiary)]">
              <span>User: <strong className="text-[var(--text-primary)]">{detail.user_email || "system"}</strong></span>
              <span className="pk-num">IP: {detail.ip_address || "—"}</span>
              <span className="pk-num">At: {fmtDateTime(detail.created_at)}</span>
              <span>Entity ID: {detail.entity_id ?? "—"}</span>
            </div>
            {(detail.old_values || detail.new_values) && (
              <div className="space-y-2">
                {detail.old_values != null && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Before</p>
                    <pre className="max-h-44 overflow-auto rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] p-3 text-[11px]">{JSON.stringify(detail.old_values, null, 2)}</pre>
                  </div>
                )}
                {detail.new_values != null && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">After</p>
                    <pre className="max-h-44 overflow-auto rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] p-3 text-[11px]">{JSON.stringify(detail.new_values, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
