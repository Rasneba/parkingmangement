"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightCircle, Car, Check, CheckCircle2, ChevronDown, Download, Printer, RotateCcw, Share2, Zap,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Skeleton, Textarea,
  cn, fmtDateTime, useToast,
} from "@/lib/ui";
import { apiGet, apiPost } from "@/lib/client";
import { renderTicketImage, shareOrDownload, downloadBlob, ticketFileName } from "@/lib/ticket-image";

const VEHICLE_TYPES = ["car", "suv", "truck", "bus", "motorcycle", "bicycle", "other"];

interface VehicleLite { id: number; plate_number: string; vehicle_type: string; owner_name: string; is_blacklisted: boolean; customer_id: number | null }
interface CustomerLite { id: number; full_name: string; customer_id: string; phone: string }
interface GateLite { id: number; name: string; code: string }
interface SlotRow {
  id: number;
  slot_number: string;
  zone_id: number;
  zone_name: string;
  zone_code: string;
  floor: number | null;
  status: string;
  type: string;
}

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

function slotTone(status: string, selected: boolean) {
  if (selected) return "border-[var(--primary)] bg-[var(--primary)] text-white shadow-md";
  switch (status) {
    case "available":
      return "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] active:scale-[0.97]";
    case "occupied":
      return "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400 cursor-not-allowed";
    case "reserved":
      return "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400 cursor-not-allowed";
    default:
      return "border-[var(--card-border)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed";
  }
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
  const [gates, setGates] = useState<GateLite[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EntryResult | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const rows = await apiGet<SlotRow[]>("/api/membership/parking/slots");
      setSlots(rows);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      apiGet<CustomerLite[]>("/api/membership/parking/customers?limit=500"),
      apiGet<GateLite[]>("/api/membership/parking/gates?limit=100"),
      loadSlots(),
    ])
      .then(([c, g]) => {
        setCustomers(c);
        setGates(g);
      })
      .catch(() => toast.error("Could not load entry form data", "Check your connection and retry."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSlots]);

  // Prefill from the live map ("Start entry here")
  useEffect(() => {
    const slot = params.get("slot");
    const zone = params.get("zone");
    if (zone) setForm((f) => ({ ...f, zone_id: zone }));
    if (slot) setForm((f) => ({ ...f, slot_id: slot }));
  }, [params]);

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

  const zones = useMemo(() => {
    const map = new Map<number, { id: number; name: string; code: string }>();
    for (const s of slots) {
      if (!map.has(s.zone_id)) map.set(s.zone_id, { id: s.zone_id, name: s.zone_name, code: s.zone_code });
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [slots]);

  const visibleSlots = useMemo(() => {
    const list = form.zone_id ? slots.filter((s) => String(s.zone_id) === form.zone_id) : slots;
    return [...list].sort((a, b) => a.slot_number.localeCompare(b.slot_number));
  }, [slots, form.zone_id]);

  const selectedSlot = useMemo(
    () => slots.find((s) => String(s.id) === form.slot_id) ?? null,
    [slots, form.slot_id]
  );

  const pickSlot = (slot: SlotRow) => {
    if (slot.status !== "available") return;
    setForm((f) => ({
      ...f,
      slot_id: String(slot.id),
      zone_id: String(slot.zone_id),
    }));
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!plateValid || submitting) return;
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
      loadSlots();
      toast.success(`Ticket ${res.ticket.ticket_number} issued`, res.slot ? `Space ${res.slot.slot_number} assigned` : "No space auto-assigned");
    } catch (e: any) {
      if (e.status === 409) {
        toast.error("Check-in blocked", e.message);
        loadSlots();
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
    <div className="mx-auto max-w-[1200px] pb-24 md:pb-0">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Vehicle Entry</h1>
        <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
          Tap a free space, type the plate number, then confirm.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader icon={<Zap size={16} />} title="Check-in" subtitle="Select a space and enter the license plate" />
          <form onSubmit={submit} className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
            <Field label="License plate" required hint="Registered vehicles are recognized automatically.">
              <div className="relative">
                <input
                  autoFocus
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
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
                  <Badge tone="danger" dot>blacklisted - entry will be refused</Badge>
                ) : (
                  <Badge tone="success" dot>registered vehicle</Badge>
                )}
              </div>
            )}

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Select a space
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {visibleSlots.filter((s) => s.status === "available").length} free
                  </span>
                  <select
                    value={form.zone_id}
                    onChange={(e) => setForm((f) => ({ ...f, zone_id: e.target.value, slot_id: "" }))}
                    aria-label="Filter by zone"
                    className="h-8 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-2 text-[12px] text-[var(--text-primary)] outline-none"
                  >
                    <option value="">All zones</option>
                    {zones.map((z) => (
                      <option key={z.id} value={String(z.id)}>{z.code} - {z.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {slotsLoading ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {Array.from({ length: 20 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
              ) : visibleSlots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] px-4 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                  No spaces configured. Add spaces under Facility.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {visibleSlots.map((slot) => {
                    const selected = form.slot_id === String(slot.id);
                    const disabled = slot.status !== "available";
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => pickSlot(slot)}
                        aria-pressed={selected}
                        className={cn(
                          "relative flex h-16 flex-col items-center justify-center rounded-xl border-2 transition-all select-none",
                          slotTone(slot.status, selected)
                        )}
                      >
                        {selected && (
                          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
                            <Check size={11} />
                          </span>
                        )}
                        <span className="pk-num text-[15px] font-bold leading-none">{slot.slot_number}</span>
                        <span className={cn("mt-1 text-[10px] font-medium capitalize", selected ? "text-white/85" : "")}>
                          {slot.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-[var(--card-border)] bg-[var(--card-bg)]" /> Free</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500/60" /> Occupied</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500/60" /> Reserved</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400/50" /> Other</span>
              </div>

              {selectedSlot ? (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-3.5 py-2.5">
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    Selected space <span className="pk-num font-bold text-[var(--text-primary)]">{selectedSlot.slot_number}</span>
                    {selectedSlot.zone_name ? ` - ${selectedSlot.zone_name}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, slot_id: "" }))}
                    className="text-[12px] font-semibold text-[var(--primary)]"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-[var(--text-tertiary)]">No space selected - the first free space will be assigned.</p>
              )}
            </div>

            <details className="group rounded-xl border border-[var(--card-border)] px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-[var(--text-primary)]">
                More options
                <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Vehicle type">
                  <Select value={form.vehicle_type} onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))} aria-label="Vehicle type">
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Customer (optional)">
                  <Select value={form.customer_id} onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))} aria-label="Customer">
                    <option value="">Walk-in guest</option>
                    {customers.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.full_name}{c.phone ? ` - ${c.phone}` : ""}
                      </option>
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
                <Field label="Notes (optional)" className="sm:col-span-2">
                  <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything the exit station should know..." rows={2} />
                </Field>
              </div>
            </details>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="submit" size="lg" loading={submitting} disabled={!plateValid} icon={<ArrowRightCircle size={17} />} className="w-full sm:w-auto sm:min-w-[220px]">
                Check in & issue ticket
              </Button>
              <Button type="button" variant="ghost" size="md" icon={<RotateCcw size={15} />} onClick={() => { setForm({ plate: "", vehicle_type: "car", customer_id: "", zone_id: "", slot_id: "", entry_gate_id: "", entry_method: "manual", notes: "" }); setPlateLookup(null); }} className="w-full sm:w-auto">
                Reset
              </Button>
            </div>
          </form>
        </Card>

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
                      <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{s.plate_number || s.vehicle_plate || "-"}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {s.zone_name ? `${s.zone_name} - ${s.slot_number} - ` : ""}{fmtDateTime(s.entry_time)}
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
  const autoSaved = useRef(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const buildBlob = useCallback(
    () =>
      renderTicketImage({
        ticketNumber: result.ticket.ticket_number,
        plateNumber: result.session.plate_number,
        space: result.slot?.slot_number ?? null,
        entryTime: fmtDateTime(result.ticket.entry_time),
        qrDataUrl: result.ticket.qr_data_url,
      }),
    [result]
  );

  // Automatic download to the device as soon as the ticket is generated.
  useEffect(() => {
    if (autoSaved.current) return;
    autoSaved.current = true;
    (async () => {
      try {
        const blob = await buildBlob();
        downloadBlob(blob, ticketFileName(result.ticket.ticket_number));
        setSaveMsg("Ticket image downloaded");
      } catch {
        setSaveMsg(null);
      }
    })();
  }, [buildBlob, result.ticket.ticket_number]);

  const saveOrShare = async () => {
    try {
      const blob = await buildBlob();
      setSaveMsg("Opening share / save dialog...");
      const how = await shareOrDownload(blob, ticketFileName(result.ticket.ticket_number), `Parking ticket ${result.ticket.ticket_number}`);
      setSaveMsg(how === "shared" ? "Ticket shared" : "Ticket image downloaded");
    } catch {
      setSaveMsg("Could not save the ticket image");
    }
  };

  const downloadOnly = async () => {
    try {
      const blob = await buildBlob();
      downloadBlob(blob, ticketFileName(result.ticket.ticket_number));
      setSaveMsg("Ticket image downloaded");
    } catch {
      setSaveMsg("Could not save the ticket image");
    }
  };

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
            <tr><td>Space</td><td style={{ textAlign: "right" }}>{result.slot?.slot_number ?? "-"}</td></tr>
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
              {result.slot ? `Space ${result.slot.slot_number}${result.slot.zone_name ? ` - ${result.slot.zone_name}` : ""}` : "No space assigned"}
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
          <div className="space-y-2 border-t border-[var(--card-border)] px-5 py-3.5">
            {saveMsg && <p className="text-center text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">{saveMsg}</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Button size="md" icon={<Share2 size={15} />} onClick={saveOrShare}>
                Save / Share
              </Button>
              <Button variant="outline" size="md" icon={<Download size={15} />} onClick={downloadOnly}>
                Download
              </Button>
              <Button variant="outline" size="md" icon={<Printer size={15} />} onClick={() => window.print()} className="col-span-2 sm:col-span-1">
                Print
              </Button>
            </div>
            <Button size="md" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
