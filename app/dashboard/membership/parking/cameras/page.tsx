"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Pencil, Plus, Trash2, Video } from "lucide-react";
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, Select, Skeleton,
  relativeTime, useToast,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";

interface Camera {
  id: number;
  name: string;
  code: string;
  gate_id: number | null;
  gate_name: string | null;
  ip_address: string | null;
  port: number | null;
  rtsp_url: string | null;
  direction: string;
  status: string;
  protocol: string | null;
  confidence_threshold: number;
  last_heartbeat: string | null;
}

interface Gate { id: number; name: string }

export default function CamerasPage() {
  const toast = useToast();
  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [gates, setGates] = useState<Gate[]>([]);
  const [edit, setEdit] = useState<Partial<Camera> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Camera | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, g] = await Promise.all([
        apiGet<Camera[]>("/api/membership/parking/cameras?limit=200"),
        apiGet<Gate[]>("/api/membership/parking/gates?limit=100"),
      ]);
      setCameras(c);
      setGates(g);
    } catch (e: any) {
      setError(e.message);
      setCameras([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Cameras</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
            ANPR / LPR cameras mounted at gates. Registration records the stream configuration — it does not imply the camera is reachable.
          </p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setEdit({ direction: "in", protocol: "rtsp", confidence_threshold: 80 })}>Add camera</Button>
      </div>

      {error ? (
        <Card className="border-red-500/30">
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-[13px] text-[var(--accent-red)]">{error}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : !cameras ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : cameras.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Video size={20} />}
            title="No cameras registered"
            body="Add gate cameras for automatic plate recognition. Streams stay unconfigured until a bridge is connected."
            action={<Button size="sm" onClick={() => setEdit({ direction: "in", protocol: "rtsp", confidence_threshold: 80 })}>Add the first camera</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cameras.map((c) => (
            <Card key={c.id} hover className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Camera size={18} />
                  </span>
                  <div>
                    <h3 className="text-[14.5px] font-bold text-[var(--text-primary)]">{c.name}</h3>
                    <p className="text-[12px] text-[var(--text-tertiary)]">{c.code} · {c.gate_name ?? "no gate"}</p>
                  </div>
                </div>
                <Badge tone={c.status === "online" ? "success" : c.status === "offline" ? "danger" : "neutral"} dot>{c.status}</Badge>
              </div>

              <dl className="mt-4 space-y-1.5 text-[12.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Stream</dt>
                  <dd className="pk-num max-w-[200px] truncate font-medium" title={c.rtsp_url ?? undefined}>{c.rtsp_url || `${c.ip_address ?? "no host"}${c.port ? `:${c.port}` : ""}`}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Direction</dt>
                  <dd className="font-medium">{c.direction}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Min confidence</dt>
                  <dd className="pk-num font-medium">{c.confidence_threshold}%</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-tertiary)]">Last heartbeat</dt>
                  <dd className="font-medium">{c.last_heartbeat ? relativeTime(c.last_heartbeat) : "never"}</dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={() => setEdit(c)}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-[var(--accent-red)]" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete(c)} aria-label={`Delete ${c.name}`} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <CameraDialog edit={edit} gates={gates} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await apiDelete(`/api/membership/parking/cameras/${confirmDelete.id}`);
            toast.success("Camera deleted");
            setConfirmDelete(null);
            load();
          } catch (e: any) {
            toast.error("Cannot delete camera", e.message);
          }
        }}
        danger
        title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
        body="The camera registration is removed. Captured plate events already stored are preserved."
        confirmLabel="Delete camera"
      />
    </div>
  );
}

function CameraDialog({ edit, gates, onClose, onSaved }: { edit: Partial<Camera> | null; gates: Gate[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Camera>>({});
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
        gate_id: form.gate_id ? Number(form.gate_id) : null,
        ip_address: form.ip_address || null, port: form.port ? Number(form.port) : null,
        rtsp_url: form.rtsp_url || null, direction: form.direction || "in",
        protocol: form.protocol || "rtsp", confidence_threshold: Number(form.confidence_threshold ?? 80),
      };
      if (isNew) await apiPost("/api/membership/parking/cameras", body);
      else await apiPut(`/api/membership/parking/cameras/${edit.id}`, body);
      toast.success(isNew ? "Camera added" : "Camera updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<Camera>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onClose={onClose} title={isNew ? "Add camera" : `Edit ${edit.name}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Add camera" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Camera name" required><Input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Entry ANPR" /></Field>
        <Field label="Code" required><Input value={form.code ?? ""} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="CAM-ENTRY-1" /></Field>
        <Field label="Mounted at gate">
          <Select value={form.gate_id ? String(form.gate_id) : ""} onChange={(e) => set({ gate_id: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">— none —</option>
            {gates.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={form.direction ?? "in"} onChange={(e) => set({ direction: e.target.value })}>
            {["in", "out", "both"].map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="IP address"><Input value={form.ip_address ?? ""} onChange={(e) => set({ ip_address: e.target.value })} placeholder="192.168.0.20" /></Field>
        <Field label="Port"><Input type="number" min="1" max="65535" value={form.port ?? ""} onChange={(e) => set({ port: e.target.value ? Number(e.target.value) : undefined })} placeholder="554" /></Field>
        <Field label="Protocol">
          <Select value={form.protocol ?? "rtsp"} onChange={(e) => set({ protocol: e.target.value })}>
            {["rtsp", "onvif", "http", "https"].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </Select>
        </Field>
        <Field label="Min plate confidence %"><Input type="number" min="0" max="100" value={form.confidence_threshold ?? 80} onChange={(e) => set({ confidence_threshold: Number(e.target.value) })} /></Field>
        <Field label="Stream URL" className="sm:col-span-2" hint="RTSP or bridge endpoint used by the ANPR bridge">
          <Input value={form.rtsp_url ?? ""} onChange={(e) => set({ rtsp_url: e.target.value })} placeholder="rtsp://192.168.0.20:554/stream1" />
        </Field>
      </div>
    </Dialog>
  );
}
