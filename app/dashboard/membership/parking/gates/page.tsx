"use client";

import { useCallback, useEffect, useState } from "react";
import { DoorOpen, Pencil, Plus, ScanLine, Trash2 } from "lucide-react";
import {
  Badge, Button, Card, ConfirmDialog, DataTable, Dialog, EmptyState, Field, Input, Select,
  Switch, useToast, type Column,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";

interface Gate {
  id: number;
  name: string;
  code: string;
  type: string;
  direction: string;
  status: string;
  ip_address: string | null;
  port: number | null;
  serial_port: string | null;
  barrier_open_delay: number;
  is_anpr_enabled: boolean;
  is_qr_enabled: boolean;
  is_nfc_enabled: boolean;
  is_rfid_enabled: boolean;
  notes: string | null;
}

const CAPABILITIES: Array<{ key: keyof Gate; label: string }> = [
  { key: "is_anpr_enabled", label: "ANPR" },
  { key: "is_qr_enabled", label: "QR" },
  { key: "is_rfid_enabled", label: "RFID" },
  { key: "is_nfc_enabled", label: "NFC" },
];

export default function GatesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Gate[] | null>(null);
  const [edit, setEdit] = useState<Partial<Gate> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Gate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await apiGet<Gate[]>("/api/membership/parking/gates?limit=100"));
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<Gate>[] = [
    {
      key: "name",
      label: "Gate",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <DoorOpen size={15} />
          </span>
          <div>
            <p className="font-semibold text-[var(--text-primary)]">{r.name}</p>
            <p className="pk-num text-[11.5px] text-[var(--text-tertiary)]">{r.code}</p>
          </div>
        </div>
      ),
    },
    { key: "type", label: "Type", render: (r) => <span className="capitalize">{r.type}</span> },
    { key: "direction", label: "Direction", render: (r) => <Badge tone="info">{r.direction}</Badge> },
    {
      key: "status",
      label: "Status",
      render: (r) => <Badge tone={r.status === "online" ? "success" : r.status === "offline" ? "danger" : "neutral"} dot>{r.status}</Badge>,
    },
    {
      key: "capabilities",
      label: "Capabilities",
      hideBelow: "md",
      render: (r) => (
        <div className="flex gap-1">
          {CAPABILITIES.filter((c) => r[c.key]).map((c) => (
            <Badge key={c.key} tone="primary">{c.label}</Badge>
          ))}
          {CAPABILITIES.every((c) => !r[c.key]) && <span className="text-[var(--text-tertiary)]">—</span>}
        </div>
      ),
    },
    { key: "ip", label: "Address", hideBelow: "lg", render: (r) => <span className="pk-num">{r.ip_address ? `${r.ip_address}${r.port ? `:${r.port}` : ""}` : r.serial_port || "—"}</span> },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEdit(r)} aria-label={`Edit ${r.name}`} />
          <Button size="sm" variant="ghost" className="text-[var(--accent-red)]" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete(r)} aria-label={`Delete ${r.name}`} />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Gates</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Entry and exit lanes, their barrier controllers and accepted credential types.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setEdit({ type: "entry", direction: "in", barrier_open_delay: 2, is_anpr_enabled: true, is_qr_enabled: true })}>Add gate</Button>
      </div>

      <Card>
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
            empty={<EmptyState icon={<ScanLine size={20} />} title="No gates" body="Register the physical entry/exit lanes of your facility." />}
          />
        )}
      </Card>

      <GateDialog edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await apiDelete(`/api/membership/parking/gates/${confirmDelete.id}`);
            toast.success("Gate deleted");
            setConfirmDelete(null);
            load();
          } catch (e: any) {
            toast.error("Cannot delete gate", e.message);
          }
        }}
        danger
        title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
        body="Sessions and tickets that referenced this gate keep their records. Make sure no active kiosk or bridge is bound to it."
        confirmLabel="Delete gate"
      />
    </div>
  );
}

function GateDialog({ edit, onClose, onSaved }: { edit: Partial<Gate> | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Gate>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(edit ?? {}), [edit]);
  if (!edit) return null;
  const isNew = !edit.id;

  const save = async () => {
    if (!form.name?.trim() || !form.code?.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(), code: form.code.trim().toUpperCase(),
        type: form.type || "entry", direction: form.direction || "in",
        ip_address: form.ip_address || null, port: form.port ? Number(form.port) : null,
        serial_port: form.serial_port || null, barrier_open_delay: Number(form.barrier_open_delay ?? 2),
        is_anpr_enabled: !!form.is_anpr_enabled, is_qr_enabled: !!form.is_qr_enabled,
        is_rfid_enabled: !!form.is_rfid_enabled, is_nfc_enabled: !!form.is_nfc_enabled,
        notes: form.notes || null,
      };
      if (isNew) await apiPost("/api/membership/parking/gates", body);
      else await apiPut(`/api/membership/parking/gates/${edit.id}`, body);
      toast.success(isNew ? "Gate added" : "Gate updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<Gate>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onClose={onClose} title={isNew ? "Add gate" : `Edit ${edit.name}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Add gate" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Gate name" required><Input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Main Entrance" /></Field>
        <Field label="Code" required hint="Short unique code"><Input value={form.code ?? ""} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="GT-MAIN-IN" /></Field>
        <Field label="Type">
          <Select value={form.type ?? "entry"} onChange={(e) => set({ type: e.target.value })}>
            {["entry", "exit", "mixed"].map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={form.direction ?? "in"} onChange={(e) => set({ direction: e.target.value })}>
            {["in", "out", "both"].map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Controller IP"><Input value={form.ip_address ?? ""} onChange={(e) => set({ ip_address: e.target.value })} placeholder="192.168.0.10" /></Field>
        <Field label="Port"><Input type="number" min="1" max="65535" value={form.port ?? ""} onChange={(e) => set({ port: e.target.value ? Number(e.target.value) : undefined })} placeholder="80" /></Field>
        <Field label="Serial port" hint="For RS-485 barrier controllers"><Input value={form.serial_port ?? ""} onChange={(e) => set({ serial_port: e.target.value })} placeholder="/dev/ttyUSB0" /></Field>
        <Field label="Barrier open delay (s)"><Input type="number" min="0" max="60" value={form.barrier_open_delay ?? 2} onChange={(e) => set({ barrier_open_delay: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2">
          <p className="mb-2 text-[12.5px] font-semibold text-[var(--text-secondary)]">Accepted credentials</p>
          <div className="flex flex-wrap gap-5">
            {CAPABILITIES.map((c) => (
              <Switch key={c.key} label={c.label} checked={!!form[c.key]} onChange={(v) => set({ [c.key]: v } as Partial<Gate>)} />
            ))}
          </div>
        </div>
        <Field label="Notes" className="sm:col-span-2"><Input value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}
