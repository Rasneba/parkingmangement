"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Car, Download, Pencil, Plus, ShieldBan, ShieldCheck, Trash2 } from "lucide-react";
import {
  Badge, Button, Card, ConfirmDialog, DataTable, Dialog, EmptyState, Field, Input, Select,
  Skeleton, Switch, fmtDateTime, fmtMoney, useToast, type Column,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";

const VEHICLE_TYPES = ["car", "suv", "truck", "bus", "motorcycle", "bicycle", "other"];

interface Vehicle {
  id: number;
  plate_number: string;
  vehicle_type: string;
  vehicle_model: string | null;
  vehicle_color: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  rfid_tag: string | null;
  nfc_tag: string | null;
  customer_id: number | null;
  customer_name: string | null;
  is_resident: boolean;
  is_blacklisted: boolean;
  notes: string | null;
  session_count: number | string;
}

interface SessionRow {
  id: number;
  ticket_number: string;
  plate_number: string;
  entry_time: string;
  exit_time: string | null;
  status: string;
  payment_status: string;
  amount_due: string | number;
}

const TYPE_TONES: Record<string, "info" | "success" | "warning" | "primary" | "neutral"> = {
  car: "info", suv: "primary", truck: "warning", bus: "warning",
  motorcycle: "success", bicycle: "success", other: "neutral",
};

export default function VehiclesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Vehicle[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [blacklistedOnly, setBlacklistedOnly] = useState(false);
  const [detail, setDetail] = useState<Vehicle | null>(null);
  const [history, setHistory] = useState<SessionRow[] | null>(null);
  const [edit, setEdit] = useState<Partial<Vehicle> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const sp = new URLSearchParams({ limit: "1000" });
      if (q.trim()) sp.set("q", q.trim());
      if (type) sp.set("vehicle_type", type);
      if (blacklistedOnly) sp.set("blacklisted", "true");
      setRows(await apiGet<Vehicle[]>(`/api/membership/parking/vehicles?${sp}`));
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
  }, [q, type, blacklistedOnly]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const openDetail = async (v: Vehicle) => {
    setDetail(v);
    setHistory(null);
    try {
      const all = await apiGet<SessionRow[]>(`/api/membership/parking/sessions?q=${encodeURIComponent(v.plate_number)}`);
      setHistory(all.filter((s) => s.plate_number === v.plate_number).slice(0, 20));
    } catch {
      setHistory([]);
    }
  };

  const toggleBlacklist = async (v: Vehicle) => {
    try {
      await apiPut(`/api/membership/parking/vehicles/${v.id}`, { is_blacklisted: !v.is_blacklisted });
      toast.success(v.is_blacklisted ? "Vehicle removed from blacklist" : "Vehicle blacklisted — entry will be refused");
      load();
    } catch (e: any) {
      toast.error("Update failed", e.message);
    }
  };

  const exportCsv = () => {
    if (!rows?.length) return;
    const header = ["Plate", "Type", "Model", "Color", "Owner", "Phone", "Customer", "Resident", "Blacklisted", "Sessions"];
    const lines = rows.map((r) => [r.plate_number, r.vehicle_type, r.vehicle_model ?? "", r.vehicle_color ?? "", r.owner_name ?? "", r.owner_phone ?? "", r.customer_name ?? "", r.is_resident ? "yes" : "no", r.is_blacklisted ? "yes" : "no", r.session_count]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vehicles-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const stats = useMemo(() => ({
    total: rows?.length ?? 0,
    blacklisted: rows?.filter((r) => r.is_blacklisted).length ?? 0,
    residents: rows?.filter((r) => r.is_resident).length ?? 0,
  }), [rows]);

  const columns: Column<Vehicle>[] = [
    {
      key: "plate_number",
      label: "Plate",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="pk-num rounded-md border border-[var(--border-strong)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[12.5px] font-bold tracking-wide">{r.plate_number}</span>
          {r.is_blacklisted && <Badge tone="danger" dot>blacklisted</Badge>}
          {r.is_resident && <Badge tone="success">resident</Badge>}
        </div>
      ),
    },
    { key: "vehicle_type", label: "Type", render: (r) => <Badge tone={TYPE_TONES[r.vehicle_type] ?? "neutral"}>{r.vehicle_type}</Badge> },
    { key: "vehicle_model", label: "Model", hideBelow: "md", render: (r) => <span>{[r.vehicle_model, r.vehicle_color].filter(Boolean).join(" · ") || "—"}</span> },
    { key: "customer_name", label: "Customer", hideBelow: "lg", render: (r) => r.customer_name || <span className="text-[var(--text-tertiary)]">casual</span> },
    { key: "owner_name", label: "Owner", hideBelow: "md", render: (r) => <span>{r.owner_name || "—"}{r.owner_phone ? <span className="pk-num text-[var(--text-tertiary)]"> · {r.owner_phone}</span> : null}</span> },
    { key: "session_count", label: "Visits", align: "right", render: (r) => <span className="pk-num">{r.session_count}</span> },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm" variant="ghost"
            className={r.is_blacklisted ? "text-emerald-600" : "text-[var(--accent-red)]"}
            icon={r.is_blacklisted ? <ShieldCheck size={14} /> : <ShieldBan size={14} />}
            title={r.is_blacklisted ? "Remove from blacklist" : "Blacklist vehicle"}
            aria-label={r.is_blacklisted ? `Unblacklist ${r.plate_number}` : `Blacklist ${r.plate_number}`}
            onClick={() => toggleBlacklist(r)}
          />
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEdit(r)} aria-label={`Edit ${r.plate_number}`} />
          <Button size="sm" variant="ghost" className="text-[var(--accent-red)]" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete(r)} aria-label={`Delete ${r.plate_number}`} />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Vehicles</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Registered plates, owners and access flags — {stats.total} shown, {stats.blacklisted} blacklisted, {stats.residents} resident.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="md" icon={<Download size={14} />} onClick={exportCsv} disabled={!rows?.length}>Export CSV</Button>
          <Button icon={<Plus size={15} />} onClick={() => setEdit({ vehicle_type: "car" })}>Add vehicle</Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--card-border)] px-5 py-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search plate or owner…"
            className="w-full sm:w-[280px]"
            aria-label="Search vehicles"
          />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-[150px]" aria-label="Vehicle type filter">
            <option value="">All types</option>
            {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Button variant={blacklistedOnly ? "primary" : "outline"} size="md" icon={<ShieldBan size={14} />} onClick={() => setBlacklistedOnly((v) => !v)}>
            Blacklisted
          </Button>
        </div>

        {error ? (
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-[13px] text-[var(--accent-red)]">{error}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            loading={!rows}
            rowKey={(r) => r.id}
            onRowClick={openDetail}
            empty={<EmptyState icon={<Car size={20} />} title="No vehicles found" body="Vehicles are registered automatically at first entry, or add them here ahead of time." />}
          />
        )}
      </Card>

      <VehicleDialog edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />

      {/* Detail: vehicle + recent sessions */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.plate_number}` : ""} size="md"
        footer={<Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-2">
              <Info label="Type" value={detail.vehicle_type} />
              <Info label="Model" value={[detail.vehicle_model, detail.vehicle_color].filter(Boolean).join(" · ") || "—"} />
              <Info label="Owner" value={detail.owner_name || "—"} />
              <Info label="Phone" value={detail.owner_phone || "—"} />
              <Info label="Customer" value={detail.customer_name || "casual"} />
              <Info label="RFID tag" value={detail.rfid_tag || "—"} />
              <Info label="Visits" value={String(detail.session_count)} />
              <Info label="Flags" value={[detail.is_resident && "resident", detail.is_blacklisted && "blacklisted"].filter(Boolean).join(", ") || "—"} />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Recent sessions</p>
              {!history ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
              ) : history.length === 0 ? (
                <p className="text-[var(--text-tertiary)]">No sessions recorded for this plate yet.</p>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
                  {history.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--card-border)] px-3 py-2">
                      <div className="min-w-0">
                        <p className="pk-num truncate text-[12.5px] font-semibold">{s.ticket_number}</p>
                        <p className="text-[11.5px] text-[var(--text-tertiary)]">{fmtDateTime(s.entry_time)} → {s.exit_time ? fmtDateTime(s.exit_time) : "active"}</p>
                      </div>
                      <div className="text-right">
                        <Badge tone={s.status === "active" ? "success" : "neutral"} dot>{s.status}</Badge>
                        <p className="pk-num mt-0.5 text-[12px] font-semibold">{fmtMoney(s.amount_due)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await apiDelete(`/api/membership/parking/vehicles/${confirmDelete.id}`);
            toast.success("Vehicle deleted");
            setConfirmDelete(null);
            load();
          } catch (e: any) {
            toast.error("Cannot delete vehicle", e.message);
          }
        }}
        danger
        title={confirmDelete ? `Delete ${confirmDelete.plate_number}?` : ""}
        body="The vehicle record is removed. Historical sessions and payments keep their snapshot of the plate."
        confirmLabel="Delete vehicle"
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="pk-truncate-1 font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function VehicleDialog({ edit, onClose, onSaved }: { edit: Partial<Vehicle> | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Vehicle>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(edit ?? {}), [edit]);
  if (!edit) return null;
  const isNew = !edit.id;

  const save = async () => {
    const plate = (form.plate_number ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9\s\-]{1,19}$/.test(plate)) {
      toast.error("Invalid plate", "Use 2–20 characters: letters, digits, spaces or dashes.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        plate_number: plate,
        vehicle_type: form.vehicle_type || "car",
        vehicle_model: form.vehicle_model || null,
        vehicle_color: form.vehicle_color || null,
        owner_name: form.owner_name || null,
        owner_phone: form.owner_phone || null,
        owner_email: form.owner_email || null,
        rfid_tag: form.rfid_tag || null,
        nfc_tag: form.nfc_tag || null,
        is_resident: !!form.is_resident,
        notes: form.notes || null,
      };
      if (!isNew) body.is_blacklisted = !!form.is_blacklisted;
      if (isNew) await apiPost("/api/membership/parking/vehicles", body);
      else await apiPut(`/api/membership/parking/vehicles/${edit.id}`, body);
      toast.success(isNew ? "Vehicle registered" : "Vehicle updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<Vehicle>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onClose={onClose} title={isNew ? "Add vehicle" : `Edit ${edit.plate_number}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Register vehicle" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Plate number" required hint="Uppercase letters, digits, spaces or dashes">
          <Input value={form.plate_number ?? ""} onChange={(e) => set({ plate_number: e.target.value.toUpperCase() })} placeholder="3A-12345" className="pk-num font-mono" />
        </Field>
        <Field label="Vehicle type">
          <Select value={form.vehicle_type ?? "car"} onChange={(e) => set({ vehicle_type: e.target.value })}>
            {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Model"><Input value={form.vehicle_model ?? ""} onChange={(e) => set({ vehicle_model: e.target.value })} placeholder="Toyota Vitz" /></Field>
        <Field label="Color"><Input value={form.vehicle_color ?? ""} onChange={(e) => set({ vehicle_color: e.target.value })} placeholder="Silver" /></Field>
        <Field label="Owner name"><Input value={form.owner_name ?? ""} onChange={(e) => set({ owner_name: e.target.value })} /></Field>
        <Field label="Owner phone"><Input value={form.owner_phone ?? ""} onChange={(e) => set({ owner_phone: e.target.value })} placeholder="+251…" className="pk-num" /></Field>
        <Field label="Owner email"><Input type="email" value={form.owner_email ?? ""} onChange={(e) => set({ owner_email: e.target.value })} /></Field>
        <Field label="RFID tag"><Input value={form.rfid_tag ?? ""} onChange={(e) => set({ rfid_tag: e.target.value })} className="pk-num" /></Field>
        {!isNew && (
          <div className="flex items-center gap-6 sm:col-span-2">
            <Switch label="Resident" checked={!!form.is_resident} onChange={(v) => set({ is_resident: v })} />
            <Switch label="Blacklisted (entry refused)" checked={!!form.is_blacklisted} onChange={(v) => set({ is_blacklisted: v })} />
          </div>
        )}
        {isNew && (
          <div className="flex items-center gap-6 sm:col-span-2">
            <Switch label="Resident" checked={!!form.is_resident} onChange={(v) => set({ is_resident: v })} />
            <span className="text-[12px] text-[var(--text-tertiary)]">Blacklisting is available after the vehicle exists.</span>
          </div>
        )}
        <Field label="Notes" className="sm:col-span-2"><Input value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}
