"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, Grid3x3, Layers, MapPin, Pencil, Plus, Trash2, Wrench,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, Dialog, EmptyState, Field, Input,
  Progress, Segmented, Select, Switch, cn, fmtInt, useToast, type Column,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";

const ZONE_TYPES = ["standard", "vip", "disabled", "reserved", "electric", "staff"];
const SLOT_TYPES = ZONE_TYPES;
const SLOT_STATUSES = ["available", "occupied", "reserved", "maintenance"];

interface Site { id: number; name: string; code: string; city?: string; address?: string; total_capacity: number; is_active: boolean; contact_name?: string; contact_phone?: string; notes?: string }
interface Zone { id: number; name: string; code: string; floor: number | null; type: string; slot_count: number; site_id: number | null; is_active: boolean; description?: string }
interface Slot { id: number; zone_id: number; slot_number: string; floor: number | null; status: string; type: string; current_session_id: number | null }

export default function SpacesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"spaces" | "zones" | "sites">("spaces");

  const [sites, setSites] = useState<Site[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // dialogs
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [editZone, setEditZone] = useState<Zone | null>(null);
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "site" | "zone" | "slot"; row: any } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, z, sl] = await Promise.all([
        apiGet<Site[]>("/api/membership/parking/sites?limit=100"),
        apiGet<Zone[]>("/api/membership/parking/zones?limit=300"),
        apiGet<Slot[]>("/api/membership/parking/slots?limit=2000"),
      ]);
      setSites(s);
      setZones(z);
      setSlots(sl);
    } catch (e: any) {
      toast.error("Failed to load facility data", e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const zoneById = useCallback((id: number | null) => zones.find((z) => z.id === id) ?? null, [zones]);

  const filteredZones = zones
    .filter((z) => !siteFilter || String(z.site_id ?? "") === siteFilter)
    .filter((z) => !search || `${z.name} ${z.code}`.toLowerCase().includes(search.toLowerCase()));
  const filteredSlots = slots
    .filter((s) => !zoneFilter || String(s.zone_id) === zoneFilter)
    .filter((s) => !statusFilter || s.status === statusFilter)
    .filter((s) => !search || s.slot_number.toLowerCase().includes(search.toLowerCase()))
    .filter((s) => {
      if (!siteFilter) return true;
      const z = zoneById(s.zone_id);
      return z ? String(z.site_id ?? "") === siteFilter : false;
    });

  const zoneStats = (z: Zone) => {
    const zs = slots.filter((s) => s.zone_id === z.id);
    return {
      capacity: zs.length,
      occupied: zs.filter((s) => s.status === "occupied").length,
      reserved: zs.filter((s) => s.status === "reserved").length,
      maintenance: zs.filter((s) => s.status === "maintenance").length,
    };
  };

  const removeRow = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const { kind, row } = confirmDelete;
    try {
      await apiDelete(`/api/membership/parking/${kind}s/${row.id}`);
      toast.success(`${kind === "slot" ? "Space" : kind === "zone" ? "Zone" : "Site"} deleted`);
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      toast.error("Cannot delete", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Spaces & Zones</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
            Facilities, floors, zones and individual spaces. Spaces with active sessions are protected from deletion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "spaces", label: <>Spaces <Badge tone="neutral" className="ml-1">{slots.length}</Badge></> },
              { value: "zones", label: <>Zones <Badge tone="neutral" className="ml-1">{zones.length}</Badge></> },
              { value: "sites", label: <>Facilities <Badge tone="neutral" className="ml-1">{sites.length}</Badge></> },
            ]}
          />
          {tab === "spaces" && <Button size="md" icon={<Plus size={15} />} onClick={() => setBulkOpen(true)}>Generate spaces</Button>}
          {tab === "zones" && <Button size="md" icon={<Plus size={15} />} onClick={() => setEditZone({ id: 0, name: "", code: "", floor: 0, type: "standard", slot_count: 0, site_id: sites[0]?.id ?? null, is_active: true })}>New zone</Button>}
          {tab === "sites" && <Button size="md" icon={<Plus size={15} />} onClick={() => setEditSite({ id: 0, name: "", code: "", city: "", address: "", total_capacity: 0, is_active: true })}>New facility</Button>}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--card-border)] px-5 py-4">
          <div className="min-w-[200px] flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "spaces" ? "Search space number…" : "Search zones…"} aria-label="Search" />
          </div>
          {tab === "spaces" && (
            <>
              <Select value={siteFilter} onChange={(e) => { setSiteFilter(e.target.value); setZoneFilter(""); }} className="w-[170px]" aria-label="Facility filter">
                <option value="">All facilities</option>
                {sites.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </Select>
              <Select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="w-[170px]" aria-label="Zone filter">
                <option value="">All zones</option>
                {zones.filter((z) => !siteFilter || String(z.site_id ?? "") === siteFilter).map((z) => (
                  <option key={z.id} value={String(z.id)}>{z.code} — {z.name}</option>
                ))}
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[140px]" aria-label="Status filter">
                <option value="">Any status</option>
                {SLOT_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </Select>
            </>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-6 gap-2 p-5">
            {Array.from({ length: 24 }).map((_, i) => <div key={i} className="pk-skeleton h-10" />)}
          </div>
        ) : tab === "spaces" ? (
          filteredSlots.length === 0 ? (
            <EmptyState
              icon={<Grid3x3 size={20} />}
              title="No spaces yet"
              body={zones.length === 0 ? "Create a zone first, then generate numbered spaces." : "Generate numbered spaces for a zone."}
              action={<Button size="sm" onClick={() => setBulkOpen(true)} disabled={zones.length === 0}>Generate spaces</Button>}
            />
          ) : (
            <div className="grid grid-cols-4 gap-2 p-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-14 xl:grid-cols-16">
              {filteredSlots.map((s) => {
                const z = zoneById(s.zone_id);
                return (
                  <button
                    key={s.id}
                    onClick={() => setEditSlot(s)}
                    className={cn("pk-space", `pk-space--${s.status}`)}
                    title={`${s.slot_number} · ${z?.code ?? ""} · ${s.type} · ${s.status}`}
                  >
                    <span className="text-[11px]">{s.slot_number}</span>
                    <span className="text-[8px] font-medium uppercase opacity-70">{s.type === "standard" ? "" : s.type.slice(0, 4)}</span>
                    {s.status === "maintenance" && <Wrench size={9} />}
                  </button>
                );
              })}
            </div>
          )
        ) : tab === "zones" ? (
          <DataTable<Zone & { stats?: ReturnType<typeof zoneStats> }>
            columns={[
              { key: "code", label: "Code", render: (z) => <span className="font-semibold">{z.code}</span> },
              { key: "name", label: "Zone" },
              { key: "facility", label: "Facility", hideBelow: "md", render: (z) => sites.find((s) => s.id === z.site_id)?.name ?? "—" },
              { key: "floor", label: "Floor", align: "center", render: (z) => (z.floor != null ? (z.floor === 0 ? "Ground" : `F${z.floor}`) : "—") },
              { key: "type", label: "Type", render: (z) => <Badge tone="neutral">{z.type}</Badge> },
              {
                key: "occupancy", label: "Occupancy", render: (z) => {
                  const st = zoneStats(z);
                  return (
                    <div className="min-w-[130px]">
                      <div className="mb-1 flex justify-between text-[11px] text-[var(--text-tertiary)] pk-num">
                        <span>{st.occupied}/{st.capacity}</span>
                        {st.maintenance > 0 && <span>{st.maintenance} maint.</span>}
                      </div>
                      <Progress value={st.capacity ? (st.occupied / st.capacity) * 100 : 0} />
                    </div>
                  );
                },
              },
              { key: "is_active", label: "Active", align: "center", render: (z) => <Badge tone={z.is_active ? "success" : "neutral"} dot>{z.is_active ? "yes" : "no"}</Badge> },
              {
                key: "actions", label: "", align: "right", render: (z) => (
                  <div className="flex justify-end gap-1">
                    <Button size="xs" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditZone(z)} aria-label={`Edit zone ${z.code}`}>Edit</Button>
                    <Button size="xs" variant="ghost" className="text-[var(--accent-red)]" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete({ kind: "zone", row: z })} aria-label={`Delete zone ${z.code}`} />
                  </div>
                ),
              },
            ]}
            rows={filteredZones}
            rowKey={(z) => z.id}
            empty={<EmptyState icon={<Layers size={20} />} title="No zones" body="Group spaces into zones by floor, wing or purpose." />}
          />
        ) : (
          <DataTable<Site>
            columns={[
              { key: "name", label: "Facility", render: (s) => <span className="flex items-center gap-2 font-semibold"><Building2 size={14} className="text-[var(--text-tertiary)]" />{s.name}</span> },
              { key: "code", label: "Code" },
              { key: "city", label: "City", hideBelow: "sm", render: (s) => s.city || "—" },
              { key: "capacity", label: "Capacity", align: "right", render: (s) => fmtInt(s.total_capacity) },
              { key: "contact", label: "Contact", hideBelow: "lg", render: (s) => s.contact_name || "—" },
              { key: "is_active", label: "Active", align: "center", render: (s) => <Badge tone={s.is_active ? "success" : "neutral"} dot>{s.is_active ? "yes" : "no"}</Badge> },
              {
                key: "actions", label: "", align: "right", render: (s) => (
                  <div className="flex justify-end gap-1">
                    <Button size="xs" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditSite(s)} aria-label={`Edit ${s.name}`}>Edit</Button>
                    <Button size="xs" variant="ghost" className="text-[var(--accent-red)]" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete({ kind: "site", row: s })} aria-label={`Delete ${s.name}`} />
                  </div>
                ),
              },
            ]}
            rows={sites}
            rowKey={(s) => s.id}
            empty={<EmptyState icon={<MapPin size={20} />} title="No facilities" body="Add your first parking facility (site)." />}
          />
        )}
      </Card>

      {/* ------------------------------ dialogs ------------------------------ */}
      <SiteDialog site={editSite} onClose={() => setEditSite(null)} onSaved={() => { setEditSite(null); load(); }} />
      <ZoneDialog zone={editZone} sites={sites} onClose={() => setEditZone(null)} onSaved={() => { setEditZone(null); load(); }} />
      <BulkDialog open={bulkOpen} zones={zones} onClose={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); load(); }} />
      <SlotDialog slot={editSlot} zone={editSlot ? zoneById(editSlot.zone_id) : null} onClose={() => setEditSlot(null)} onSaved={() => { setEditSlot(null); load(); }} onDelete={() => { const s = editSlot; setEditSlot(null); if (s) setConfirmDelete({ kind: "slot", row: s }); }} />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={removeRow}
        loading={busy}
        danger
        title={confirmDelete ? `Delete ${confirmDelete.kind === "slot" ? "space" : confirmDelete.kind} “${confirmDelete.row.name || confirmDelete.row.code || confirmDelete.row.slot_number}”?` : ""}
        body="This permanently removes the record. Spaces with active sessions are refused by the server."
        confirmLabel="Delete"
      />
    </div>
  );
}

/* -------------------------------- dialogs --------------------------------- */

function SiteDialog({ site, onClose, onSaved }: { site: Site | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Site>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(site ?? {}), [site]);
  if (!site) return null;
  const isNew = site.id === 0;

  const save = async () => {
    if (!form.name?.trim() || !form.code?.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(), code: form.code.trim().toUpperCase(), city: form.city || null, address: form.address || null,
        total_capacity: Number(form.total_capacity) || 0, is_active: form.is_active !== false,
        contact_name: form.contact_name || null, contact_phone: form.contact_phone || null,
      };
      if (isNew) await apiPost("/api/membership/parking/sites", body);
      else await apiPut(`/api/membership/parking/sites/${site.id}`, body);
      toast.success(isNew ? "Facility created" : "Facility updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isNew ? "New facility" : `Edit ${site.name}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Create" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Code" required hint="Short unique code, e.g. MAIN"><Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} /></Field>
        <Field label="City"><Input value={form.city ?? ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></Field>
        <Field label="Total capacity"><Input type="number" min="0" value={form.total_capacity ?? 0} onChange={(e) => setForm((f) => ({ ...f, total_capacity: Number(e.target.value) }))} /></Field>
        <Field label="Contact name"><Input value={form.contact_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} /></Field>
        <Field label="Contact phone"><Input value={form.contact_phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={form.is_active !== false} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
          <span className="text-[13px] text-[var(--text-secondary)]">Facility is active</span>
        </div>
      </div>
    </Dialog>
  );
}

function ZoneDialog({ zone, sites, onClose, onSaved }: { zone: Zone | null; sites: Site[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Zone>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(zone ?? {}), [zone]);
  if (!zone) return null;
  const isNew = zone.id === 0;

  const save = async () => {
    if (!form.name?.trim() || !form.code?.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(), code: form.code.trim().toUpperCase(),
        floor: form.floor != null && form.floor !== ("" as any) ? Number(form.floor) : 0,
        type: form.type || "standard", site_id: form.site_id ? Number(form.site_id) : null,
        is_active: form.is_active !== false, description: form.description || null,
      };
      if (isNew) await apiPost("/api/membership/parking/zones", body);
      else await apiPut(`/api/membership/parking/zones/${zone.id}`, body);
      toast.success(isNew ? "Zone created" : "Zone updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isNew ? "New zone" : `Edit zone ${zone.code}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Create" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Code" required hint="e.g. A, B2, P1"><Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} /></Field>
        <Field label="Facility"><Select value={form.site_id ?? ""} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">— none —</option>
          {sites.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </Select></Field>
        <Field label="Floor"><Input type="number" min="0" value={form.floor ?? 0} onChange={(e) => setForm((f) => ({ ...f, floor: Number(e.target.value) }))} /></Field>
        <Field label="Zone type">
          <Select value={form.type ?? "standard"} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {ZONE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.is_active !== false} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
          <span className="text-[13px] text-[var(--text-secondary)]">Zone accepts vehicles</span>
        </div>
      </div>
    </Dialog>
  );
}

function BulkDialog({ open, zones, onClose, onDone }: { open: boolean; zones: Zone[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ zone_id: "", prefix: "", count: 20, floor: "", type: "standard", start_number: 1 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && zones.length > 0 && !form.zone_id) {
      const z = zones[0];
      setForm((f) => ({ ...f, zone_id: String(z.id), prefix: z.code.toUpperCase() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zones]);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await apiPost<{ created: number; skipped: number }>("/api/membership/parking/slots/bulk", {
        zone_id: Number(form.zone_id), prefix: form.prefix, count: Number(form.count),
        floor: form.floor === "" ? null : Number(form.floor), type: form.type, start_number: Number(form.start_number) || 1,
      });
      toast.success(`${res.created} space(s) generated`, res.skipped > 0 ? `${res.skipped} existing number(s) skipped` : undefined);
      onDone();
    } catch (e: any) {
      toast.error("Generation failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Generate spaces" subtitle="Create sequentially numbered spaces for a zone" size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} disabled={!form.zone_id || !form.prefix.trim()} onClick={generate}>Generate</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Zone" required>
          <Select value={form.zone_id} onChange={(e) => {
            const z = zones.find((zz) => String(zz.id) === e.target.value);
            setForm((f) => ({ ...f, zone_id: e.target.value, prefix: z ? z.code.toUpperCase() : f.prefix }));
          }}>
            {zones.map((z) => <option key={z.id} value={String(z.id)}>{z.code} — {z.name}</option>)}
          </Select>
        </Field>
        <Field label="Number prefix" required hint="Spaces are named prefix-001, prefix-002…">
          <Input value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))} />
        </Field>
        <Field label="Start number"><Input type="number" min="1" value={form.start_number} onChange={(e) => setForm((f) => ({ ...f, start_number: Number(e.target.value) }))} /></Field>
        <Field label="How many" hint="1–500 per batch"><Input type="number" min="1" max="500" value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value) }))} /></Field>
        <Field label="Floor" hint="Leave empty to inherit the zone floor"><Input type="number" min="0" value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} placeholder="zone default" /></Field>
        <Field label="Space type">
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {SLOT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function SlotDialog({ slot, zone, onClose, onSaved, onDelete }: { slot: Slot | null; zone: Zone | null; onClose: () => void; onSaved: () => void; onDelete: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Slot>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(slot ?? {}), [slot]);
  if (!slot) return null;

  const save = async () => {
    setBusy(true);
    try {
      await apiPut(`/api/membership/parking/slots/${slot.id}`, {
        slot_number: form.slot_number, floor: form.floor, status: form.status, type: form.type,
      });
      toast.success("Space updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Space ${slot.slot_number}`} subtitle={zone ? `${zone.code} — ${zone.name}${zone.floor != null ? ` · floor ${zone.floor}` : ""}` : undefined} size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" className="mr-auto text-[var(--accent-red)]" icon={<Trash2 size={14} />} onClick={onDelete}>Delete</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} onClick={save}>Save</Button>
        </>
      }>
      <div className="space-y-4">
        <Field label="Space number"><Input value={form.slot_number ?? ""} onChange={(e) => setForm((f) => ({ ...f, slot_number: e.target.value.toUpperCase() }))} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <Select value={form.status ?? "available"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {SLOT_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.type ?? "standard"} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {SLOT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Floor"><Input type="number" min="0" value={form.floor ?? 0} onChange={(e) => setForm((f) => ({ ...f, floor: Number(e.target.value) }))} /></Field>
        {form.status === "occupied" && slot.status !== "occupied" && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-[var(--text-secondary)]">
            Marking a space occupied manually does not create a session — use Vehicle Entry for real check-ins.
          </p>
        )}
      </div>
    </Dialog>
  );
}
