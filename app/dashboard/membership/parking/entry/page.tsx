"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRightCircle, Car, CheckCircle2, Printer, RotateCcw, Zap } from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Skeleton, Textarea,
  cn, fmtDateTime, fmtDuration, useToast,
} from "@/lib/ui";
import { apiGet, apiPost } from "@/lib/client";

const VEHICLE_TYPES = ["car", "suv", "truck", "bus", "motorcycle", "bicycle", "other"];

interface VehicleLite { id: number; plate_number: string; vehicle_type: string; owner_name: string; is_blacklisted: boolean; customer_id: number | null }
interface CustomerLite { id: number; full_name: string; customer_id: string; phone: string }
interface ZoneLite { id: number; name: string; code: string; floor: number | null }
interface GateLite { id: number; name: string; code: string }
interface EntrySlot { id: number; slot_number: string; zone_id: number }

interface EntryResult {
  session: { id: number; ticket_number: string; plate_number: string; entry_time: string; entry_method: string };
  slot: { slot_number: string; zone_name?: string | null; zone_code?: string | null } | null;
  ticket: { ticket_number: string; qr_data_url: string; entry_time: string };
}

export default function VehicleEntryPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="pk-spinner" /></div>}>
      <EntryForm />
    </Suspense>
  );
}

function EntryForm() {
  const toast = useToast();
  const params = useSearchParams();

  const [form, setForm] = useState({
    plate: "",
    vehicle_type: "car",
    customer_id: "",
    zone_id: "",
    slot_id: "",
    entry_gate_id: "",
    entry_method: "manual",
    notes: "",
  });
  const [plateLookup, setPlateLookup] = useState<VehicleLite | null>(null);
  const [plateBusy, setPlateBusy] = useState(false);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [zones, setZones] = useState<ZoneLite[]>([]);
  const [gates, setGates] = useState<GateLite[]>([]);
  const [slots, setSlots] = useState<EntrySlot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EntryResult | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<CustomerLite[]>("/api/membership/parking/customers?limit=500"),
      apiGet<ZoneLite[]>("/api/membership/parking/zones?limit=200"),
      apiGet<GateLite[]>("/api/membership/parking/gates?limit=100"),
    ])
      .then(([c, z, g]) => {
        setCustomers(c);
        setZones(z);
        setGates(g);
      })
      .catch(() => toast.error("Could not load entry form data", "Check your connection and retry."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSlots = useCallback(async (zoneId: string) => {
    if (!zoneId) {
      setSlots([]);
      return;
    }
    try {
      const rows = await apiGet<EntrySlot[]>(`/api/membership/parking/slots?zone_id=${zoneId}&status=available&limit=500`);
      setSlots(rows);
    } catch {
      setSlots([]);
    }
  }, []);

  // Prefill from the live map ("Start entry here")
  useEffect(() => {
    const slot = params.get("slot");
    const zone = params.get("zone");
    if (zone) {
      setForm((f) => ({ ...f, zone_id: zone }));
      loadSlots(zone).then(() => {
        if (slot) setForm((f) => ({ ...f, slot_id: slot }));
      });
    }
  }, [params, loadSlots]);

  // Debounced plate lookup for instant recognition of registered vehicles
  useEffect(() => {
    const plate = form.plate.trim().toUpperCase();
    if (plate.length < 3) {
      setPlateLookup(null);
      return;
    }
    setPlateBusy(true);
    const t = setTimeout(async () => {
      try {
        const rows = await apiGet<VehicleLite[]>(`/api/membership/parking/vehicles?q=${encodeURIComponent(plate)}&limit=5`);
        const match = rows.find((v) => v.plate_number === plate) ?? null;
        setPlateLookup(match);
        if (match) {
          setForm((f) => ({
            ...f,
            vehicle_type: match.vehicle_type || f.vehicle_type,
            customer_id: match.customer_id ? String(match.customer_id) : f.customer_id,
          }));
        }
      } catch {
        setPlateLookup(null);
      } finally {
        setPlateBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [form.plate]);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const rows = await apiGet<any[]>("/api/membership/parking/sessions?status=active&limit=8");
      setRecent(rows);
    } catch {
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const plateValid = useMemo(() => /^[A-Z0-9][A-Z0-9\s\-]{1,19}$/.test(form.plate.trim().toUpperCase()), [form.plate]);
  const canSubmit = plateValid && !submitting;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await apiPost<EntryResult>("/api/membership/parking/sessions/entry", {
        plate_number: form.plate.trim().toUpperCase(),
        vehicle_type: form.vehicle_type,
        customer_id: form.customer_id || undefined,
        zone_id: form.zone_id || undefined,
        slot_id: form.slot_id || undefined,
        entry_gate_id: form.entry_gate_id || undefined,
        entry_method: form.entry_method,
        entry_source: "web",
        notes: form.notes || undefined,
      });
      setResult(res);
      setForm((f) => ({ ...f, plate: "", slot_id: "", notes: "", customer_id: "" }));
      setPlateLookup(null);
      loadRecent();
      toast.success(`Ticket ${res.ticket.ticket_number} issued`, res.slot ? `Space ${res.slot.slot_number} assigned` : "No space auto-assigned");
    } catch (e: any) {
      if (e.status === 409) {
        toast.error("Check-in blocked", e.message);
      } else if (e.status === 403) {
        toast.error("Vehicle refused", e.message);
      } else {
        toast.error("Entry failed", e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Vehicle Entry</h1>
        <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Fast check-in for reception desks and parking attendants — optimized for touch.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* ------------------------------ form ------------------------------ */}
        <Card className="lg:col-span-3">
          <CardHeader icon={<Zap size={16} />} title="Check-in" subtitle="Enter the license plate — everything else is optional" />
          <form onSubmit={submit} className="space-y-4 px-5 py-5">
            <Field label="License plate" required hint="Type or key the plate and press Enter to check in. Registered vehicles are recognized automatically.">
              <div className="relative">
                <input
                  autoFocus
                  value={form.plate}
                  onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                  placeholder="e.g. ABC-1234"
                  aria-label="License plate"
                  aria-invalid={form.plate.length > 0 && !plateValid}
                  className={cn(
                    "h-14 w-full rounded-xl border-2 px-4 text-center text-2xl font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]",
                    "bg-[var(--input-bg)] placeholder:text-[var(--text-tertiary)] placeholder:tracking-normal placeholder:text-base placeholder:font-normal",
                    "focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
                    form.plate.length > 0 && !plateValid ? "border-[var(--accent-red)]" : "border-[var(--input-border)]"
                  )}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                />
                {plateBusy && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="pk-spinner !h-4 !w-4 !border-2" /></div>}
              </div>
            </Field>

            {plateLookup && (
              <div className={cn("flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-3 text-[13px]", plateLookup.is_blacklisted ? "border-red-500/30 bg-red-500/5" : "border-[var(--card-border)] bg-[var(--surface-sunken)]")}>
                <Car size={15} className="text-[var(--text-tertiary)]" />
                <span className="font-semibold">{plateLookup.plate_number}</span>
                <Badge tone="neutral">{plateLookup.vehicle_type}</Badge>
                {plateLookup.owner_name && <span className="text-[var(--text-secondary)]">{plateLookup.owner_name}</span>}
                {plateLookup.is_blacklisted ? (
                  <Badge tone="danger" dot>blacklisted — entry will be refused</Badge>
                ) : (
                  <Badge tone="success" dot>registered vehicle</Badge>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Vehicle type">
                <Select value={form.vehicle_type} onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))} aria-label="Vehicle type">
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Customer (optional)" hint="Link a walk-in to a registered customer">
                <Select value={form.customer_id} onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))} aria-label="Customer">
                  <option value="">Walk-in guest</option>
                  {customers.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.full_name}{c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Zone" hint="Leave on auto to assign the first free space">
                <Select
                  value={form.zone_id}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, zone_id: e.target.value, slot_id: "" }));
                    loadSlots(e.target.value);
                  }}
                  aria-label="Zone"
                >
                  <option value="">Auto-assign</option>
                  {zones.map((z) => (
                    <option key={z.id} value={String(z.id)}>{z.code} — {z.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Specific space" hint={form.zone_id ? "Optional — pick an exact space" : "Select a zone first"}>
                <Select value={form.slot_id} onChange={(e) => setForm((f) => ({ ...f, slot_id: e.target.value }))} disabled={!form.zone_id} aria-label="Parking space">
                  <option value="">Auto-assign within zone</option>
                  {slots.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.slot_number}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Entry gate">
                <Select value={form.entry_gate_id} onChange={(e) => setForm((f) => ({ ...f, entry_gate_id: e.target.value }))} aria-label="Entry gate">
                  <option value="">Not specified</option>
                  {gates.map((g) => (
                    <option key={g.id} value={String(g.id)}>{g.name} ({g.code})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Entry method">
                <Select value={form.entry_method} onChange={(e) => setForm((f) => ({ ...f, entry_method: e.target.value }))} aria-label="Entry method">
                  <option value="manual">Manual (attendant)</option>
                  <option value="anpr">ANPR camera</option>
                  <option value="qr">QR ticket</option>
                  <option value="rfid">RFID</option>
                </Select>
              </Field>
            </div>

            <Field label="Notes (optional)">
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything the exit station should know…" rows={2} />
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" size="lg" loading={submitting} disabled={!plateValid} icon={<ArrowRightCircle size={17} />} className="min-w-[190px]">
                Check in & issue ticket
              </Button>
              <Button type="button" variant="ghost" size="md" icon={<RotateCcw size={15} />} onClick={() => { setForm({ plate: "", vehicle_type: "car", customer_id: "", zone_id: "", slot_id: "", entry_gate_id: "", entry_method: "manual", notes: "" }); setPlateLookup(null); }}>
                Reset
              </Button>
            </div>
          </form>
        </Card>

        {/* --------------------------- recent feed --------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader title="Recently parked" subtitle="Live feed of active sessions" />
          <div className="max-h-[560px] overflow-y-auto">
            {recentLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState icon={<Car size={20} />} title="No active sessions" body="Checked-in vehicles appear here instantly." />
            ) : (
              <ul>
                {recent.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-[var(--card-border)] px-5 py-3 last:border-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                      <Car size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{s.plate_number || s.vehicle_plate || "—"}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {s.zone_name ? `${s.zone_name} · ${s.slot_number} · ` : ""}{fmtDateTime(s.entry_time)}
                      </p>
                    </div>
                    <span className="pk-num text-[11px] font-semibold text-[var(--text-tertiary)]">{s.ticket_number}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* ---------------------------- ticket dialog ---------------------------- */}
      {result && (
        <TicketDialog
          result={result}
          onClose={() => setResult(null)}
          onAnother={() => setResult(null)}
        />
      )}
    </div>
  );
}

function TicketDialog({ result, onClose }: { result: EntryResult; onClose: () => void; onAnother: () => void }) {
  return (
    <>
      <div className="pk-print-area hidden">
        <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>PARKING TICKET</strong>
        </div>
        <table style={{ width: "100%", fontSize: 13 }}>
          <tbody>
            <tr><td>Ticket</td><td style={{ textAlign: "right", fontWeight: 700 }}>{result.ticket.ticket_number}</td></tr>
            <tr><td>Plate</td><td style={{ textAlign: "right", fontWeight: 700 }}>{result.session.plate_number}</td></tr>
            <tr><td>Space</td><td style={{ textAlign: "right" }}>{result.slot?.slot_number ?? "—"}</td></tr>
            <tr><td>Entry</td><td style={{ textAlign: "right" }}>{fmtDateTime(result.ticket.entry_time)}</td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 10, fontSize: 11 }}>
          Please keep this ticket and pay at the exit station before leaving. Lost tickets are charged a flat fee.
        </p>
      </div>
      <div className="pk-overlay fixed inset-0 z-[70] flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="pk-dialog w-full max-w-md overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-lg)]">
          <div className="flex flex-col items-center border-b border-[var(--card-border)] bg-emerald-500/5 px-6 py-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckCircle2 size={24} />
            </span>
            <h2 className="mt-2.5 text-base font-bold text-[var(--text-primary)]">Vehicle checked in</h2>
            <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">
              {result.slot ? `Space ${result.slot.slot_number}${result.slot.zone_name ? ` · ${result.slot.zone_name}` : ""}` : "No space assigned"}
            </p>
          </div>
          <div className="flex flex-col items-center px-6 py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.ticket.qr_data_url} alt={`QR code for ticket ${result.ticket.ticket_number}`} className="h-44 w-44 rounded-xl border border-[var(--card-border)] bg-white p-2" />
            <p className="pk-num mt-3 text-lg font-bold tracking-wide text-[var(--text-primary)]">{result.ticket.ticket_number}</p>
            <dl className="mt-3 w-full space-y-2 text-[13px]">
              <div className="flex justify-between border-b border-[var(--card-border)] pb-2">
                <dt className="text-[var(--text-tertiary)]">Plate</dt>
                <dd className="font-semibold">{result.session.plate_number}</dd>
              </div>
              <div className="flex justify-between border-b border-[var(--card-border)] pb-2">
                <dt className="text-[var(--text-tertiary)]">Entry time</dt>
                <dd className="font-semibold">{fmtDateTime(result.ticket.entry_time)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-tertiary)]">Method</dt>
                <dd className="font-medium capitalize">{result.session.entry_method}</dd>
              </div>
            </dl>
          </div>
          <div className="flex gap-2 border-t border-[var(--card-border)] px-5 py-3.5">
            <Button variant="outline" size="md" className="flex-1" icon={<Printer size={15} />} onClick={() => window.print()}>
              Print ticket
            </Button>
            <Button size="md" className="flex-1" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
