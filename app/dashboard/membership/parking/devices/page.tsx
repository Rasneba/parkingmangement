"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Camera, CircleDot, DoorOpen, Info, MonitorSmartphone, Pencil, Plus, QrCode, Radio,
  ScanLine, Trash2, Wifi, Wrench,
} from "lucide-react";
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, Select,
  Skeleton, Switch, cn, relativeTime, useToast,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";

const DEVICE_TYPES = [
  { value: "barrier", label: "Barrier gate", icon: DoorOpen },
  { value: "rfid_reader", label: "RFID reader", icon: Radio },
  { value: "anpr_camera", label: "ANPR camera", icon: Camera },
  { value: "lpr_camera", label: "LPR camera", icon: Camera },
  { value: "access_controller", label: "Access controller", icon: Wifi },
  { value: "display", label: "Display / signage", icon: MonitorSmartphone },
  { value: "kiosk", label: "Ticket kiosk", icon: QrCode },
];
const PROTOCOLS = ["tcp", "http", "https", "rtsp", "onvif", "serial", "webhook"];

interface Device {
  id: number;
  name: string;
  code: string;
  device_type: string;
  direction: string;
  protocol: string | null;
  host: string | null;
  port: number | null;
  endpoint: string | null;
  min_confidence: number | null;
  status: string;
  is_enabled: boolean;
  last_seen_at: string | null;
  notes: string | null;
  gate_id: number | null;
}
interface Gate { id: number; name: string; code: string }
interface TestResult { reachable: boolean; mode: string; message: string; latencyMs?: number; code: string }

export default function DevicesPage() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [gates, setGates] = useState<Gate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Device | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Device | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, g] = await Promise.all([
        apiGet<Device[]>("/api/membership/parking/devices?limit=200"),
        apiGet<Gate[]>("/api/membership/parking/gates?limit=100"),
      ]);
      setDevices(d);
      setGates(g);
    } catch (e: any) {
      setError(e.message);
      setDevices([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const test = async (device: Device) => {
    setTesting(device.id);
    setTestResult(null);
    try {
      const res = await apiPost<TestResult>(`/api/membership/parking/devices/${device.id}/test`, {});
      setTestResult(res);
      load();
    } catch (e: any) {
      toast.error("Test failed", e.message);
    } finally {
      setTesting(null);
    }
  };

  const typeMeta = (t: string) => DEVICE_TYPES.find((d) => d.value === t);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Devices & Integrations</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
            Registry for barrier gates, readers, cameras and terminals. Connectivity is tested explicitly and reported honestly — a registered device is not assumed to work.
          </p>
        </div>
        <Button size="md" icon={<Plus size={15} />} onClick={() => setEdit({ id: 0, name: "", code: "", device_type: "barrier", direction: "both", protocol: "tcp", host: "", port: 80, endpoint: "", min_confidence: 80, status: "offline", is_enabled: true, last_seen_at: null, notes: "", gate_id: null })}>Register device</Button>
      </div>

      <Card className="border-sky-500/25 bg-sky-500/5">
        <div className="flex items-start gap-3 px-5 py-4">
          <Info size={16} className="mt-0.5 shrink-0 text-sky-500" />
          <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Live hardware requires a bridge.</strong> This deployment has no direct access to gate controllers or cameras from the browser.
            Set <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px]">PARKING_RELAY_HOST</code> / <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px]">PARKING_ANPR_BRIDGE_URL</code> to enable real integrations via the access bridge (<code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px]">/api/parking/access/*</code>). Until a device passes a connectivity test it is labeled <em>simulated</em>.
          </p>
        </div>
      </Card>

      {error ? (
        <Card className="border-red-500/30">
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-[13px] text-[var(--accent-red)]">Failed to load devices — {error}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : !devices ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wrench size={20} />}
            title="No devices registered"
            body="Add your barrier gates, RFID readers, ANPR cameras, printers and kiosks. Connection status shows what has actually been verified."
            action={<Button size="sm" onClick={() => setEdit({ id: 0, name: "", code: "", device_type: "barrier", direction: "both", protocol: "tcp", host: "", port: 80, endpoint: "", min_confidence: 80, status: "offline", is_enabled: true, last_seen_at: null, notes: "", gate_id: null })}>Register the first device</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => {
            const meta = typeMeta(d.device_type);
            const Icon = meta?.icon ?? ScanLine;
            const configured = !!(d.host || d.endpoint);
            return (
              <Card key={d.id} hover className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h3 className="text-[14.5px] font-bold text-[var(--text-primary)]">{d.name}</h3>
                      <p className="text-[12px] text-[var(--text-tertiary)]">{meta?.label ?? d.device_type} · {d.code}</p>
                    </div>
                  </div>
                  <StatusBadge device={d} configured={configured} />
                </div>

                <dl className="mt-4 space-y-1.5 text-[12.5px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-tertiary)]">Address</dt>
                    <dd className="pk-num truncate font-medium">{d.host ? `${d.host}${d.port ? `:${d.port}` : ""}` : d.endpoint || "not configured"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-tertiary)]">Gate</dt>
                    <dd className="font-medium">{gates.find((g) => g.id === d.gate_id)?.name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-tertiary)]">Last verified</dt>
                    <dd className="font-medium">{d.last_seen_at ? relativeTime(d.last_seen_at) : "never"}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" loading={testing === d.id} onClick={() => test(d)} icon={<Radio size={13} />}>
                    Test connection
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEdit(d)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-[var(--accent-red)]" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete(d)} aria-label={`Delete ${d.name}`} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {testResult && (
        <Card className={cn("fixed bottom-5 left-1/2 z-[60] w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 border shadow-[var(--shadow-lg)]", testResult.reachable ? "border-emerald-500/30" : "border-amber-500/30")}>
          <div className="flex items-start gap-3 px-4 py-3.5">
            {testResult.reachable ? <CircleDot size={16} className="mt-0.5 text-emerald-500" /> : <Info size={16} className="mt-0.5 text-amber-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{testResult.code} — {testResult.reachable ? "reachable" : testResult.mode === "unconfigured" ? "simulated" : "unreachable"}</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">{testResult.message}{testResult.latencyMs != null && testResult.reachable ? ` (${testResult.latencyMs}ms)` : ""}</p>
            </div>
            <button onClick={() => setTestResult(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Dismiss">✕</button>
          </div>
        </Card>
      )}

      <DeviceDialog device={edit} gates={gates} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await apiDelete(`/api/membership/parking/devices/${confirmDelete.id}`);
            toast.success("Device removed");
            setConfirmDelete(null);
            load();
          } catch (e: any) {
            toast.error("Cannot delete", e.message);
          }
        }}
        danger
        title={confirmDelete ? `Remove ${confirmDelete.name}?` : ""}
        body="The device registry entry is deleted. Access logs and audit history are preserved."
        confirmLabel="Remove device"
      />
    </div>
  );
}

function StatusBadge({ device, configured }: { device: Device; configured: boolean }) {
  if (device.status === "online") return <Badge tone="success" dot>online</Badge>;
  if (!configured) return <Badge tone="neutral">simulated</Badge>;
  if (!device.is_enabled) return <Badge tone="warning">disabled</Badge>;
  return <Badge tone="danger" dot>offline</Badge>;
}

function DeviceDialog({ device, gates, onClose, onSaved }: { device: Device | null; gates: Gate[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Device>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(device ?? {}), [device]);
  if (!device) return null;
  const isNew = device.id === 0;

  const save = async () => {
    if (!form.name?.trim() || !form.code?.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(), code: form.code.trim().toUpperCase(),
        device_type: form.device_type || "barrier", direction: form.direction || "both",
        protocol: form.protocol || null, host: form.host || null,
        port: form.port ? Number(form.port) : null, endpoint: form.endpoint || null,
        min_confidence: form.min_confidence != null ? Number(form.min_confidence) : 80,
        gate_id: form.gate_id ? Number(form.gate_id) : null,
        is_enabled: form.is_enabled !== false, notes: form.notes || null,
      };
      if (isNew) await apiPost("/api/membership/parking/devices", body);
      else await apiPut(`/api/membership/parking/devices/${device.id}`, body);
      toast.success(isNew ? "Device registered" : "Device updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isNew ? "Register device" : `Edit ${device.name}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Register" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Device name" required><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Code" required hint="Unique short code"><Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} /></Field>
        <Field label="Type">
          <Select value={form.device_type ?? "barrier"} onChange={(e) => setForm((f) => ({ ...f, device_type: e.target.value }))}>
            {DEVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Linked gate">
          <Select value={form.gate_id ? String(form.gate_id) : ""} onChange={(e) => setForm((f) => ({ ...f, gate_id: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— none —</option>
            {gates.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={form.direction ?? "both"} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
            {["in", "out", "both"].map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Protocol">
          <Select value={form.protocol ?? "tcp"} onChange={(e) => setForm((f) => ({ ...f, protocol: e.target.value }))}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </Select>
        </Field>
        <Field label="Host / IP"><Input value={form.host ?? ""} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="192.168.0.68" /></Field>
        <Field label="Port"><Input type="number" min="1" max="65535" value={form.port ?? ""} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value ? Number(e.target.value) : null }))} placeholder="80" /></Field>
        <Field label="Bridge endpoint (optional)" className="sm:col-span-2" hint="Full URL of a bridge/HTTP device endpoint — used for reachability tests">
          <Input value={form.endpoint ?? ""} onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} placeholder="https://bridge.local/api/device/…" />
        </Field>
        <Field label="Min plate confidence %" hint="For ANPR/LPR cameras"><Input type="number" min="0" max="100" value={form.min_confidence ?? 80} onChange={(e) => setForm((f) => ({ ...f, min_confidence: Number(e.target.value) }))} /></Field>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.is_enabled !== false} onChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))} label="Enabled" />
          <span className="text-[13px] text-[var(--text-secondary)]">Device enabled</span>
        </div>
      </div>
    </Dialog>
  );
}
