"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Banknote, CheckCircle2, Clock, DoorOpen, Grid3x3, Printer, QrCode,
  ScanLine, Search, Ticket, X,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, Select, Segmented, Skeleton, Switch,
  fmtDateTime, fmtDuration, fmtMoney, relativeTime, useToast,
} from "@/lib/ui";
import { apiGet, apiPost } from "@/lib/client";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "telebirr", label: "Telebirr" },
  { value: "cbebirr", label: "CBE Birr" },
  { value: "chapa", label: "Chapa" },
  { value: "addispay", label: "AddisPay" },
  { value: "bank", label: "Bank transfer" },
  { value: "pos", label: "POS terminal" },
  { value: "credit_card", label: "Credit card" },
  { value: "debit_card", label: "Debit card" },
];

interface Pricing {
  fee: { durationMinutes: number; chargeableMinutes: number; units: number; unitLabel: string; amount: number; isOvernight: boolean; currency: string; breakdown: Array<{ label: string; amount: number }>; note?: string };
  tariffId: number | null;
  tariffName: string | null;
  covered: { kind: string; label: string; end_date: string } | null;
  grossAmount: number;
  discountAmount: number;
  amountDue: number;
  currency: string;
}

interface LookupResponse {
  session?: any;
  pricing?: Pricing;
  permissions?: { canDiscount: boolean; canOverride: boolean };
  matches?: Array<{ id: number; ticket_number: string; plate_number: string; entry_time: string; status: string }>;
}

interface ExitResult {
  payment: any;
  session: any;
  pricing: Pricing;
  slot_released: boolean;
  idempotent?: boolean;
}

interface OccSlot {
  id: number;
  zone_id: number;
  slot_number: string;
  status: string;
  session_id: number | null;
  ticket_number: string | null;
  plate_number: string | null;
  zone_name: string;
  zone_code: string;
}

interface FloorMapRes {
  zones: Array<{
    id: number;
    name: string;
    code: string;
    slots: Array<{
      id: number;
      zone_id: number;
      slot_number: string;
      status: string;
      session_id: number | null;
      ticket_number: string | null;
      plate_number: string | null;
    }>;
  }>;
}

export default function VehicleExitPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="pk-spinner" /></div>}>
      <ExitStation />
    </Suspense>
  );
}

function ExitStation() {
  const toast = useToast();
  const params = useSearchParams();

  const [q, setQ] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [matches, setMatches] = useState<LookupResponse["matches"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialMode: "self" | "cashier" = params.get("mode") === "cashier" ? "cashier" : "self";
  const [method, setMethod] = useState(initialMode === "self" ? "addispay" : "cash");
  const [reference, setReference] = useState("");
  const [lostTicket, setLostTicket] = useState(false);
  const [discountType, setDiscountType] = useState<"" | "amount" | "percent">("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [settleLoading, setSettleLoading] = useState(false);
  const [receipt, setReceipt] = useState<ExitResult | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [occSlots, setOccSlots] = useState<OccSlot[]>([]);
  const [occLoading, setOccLoading] = useState(true);
  const [mode, setMode] = useState<"self" | "cashier">(initialMode);
  const [adp, setAdp] = useState<{ tx_ref: string; checkout_url: string; amount: number; currency: string } | null>(null);
  const [adpQr, setAdpQr] = useState<string | null>(null);
  const [adpBusy, setAdpBusy] = useState(false);
  const [adpStatus, setAdpStatus] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const idemKey = useRef<string>("");

  const loadOccupied = useCallback(async () => {
    setOccLoading(true);
    try {
      const fm = await apiGet<FloorMapRes>("/api/membership/parking/floor-map");
      const rows: OccSlot[] = fm.zones.flatMap((z) =>
        z.slots
          .filter((s) => s.status === "occupied" && s.session_id)
          .map((s) => ({
            id: s.id,
            zone_id: s.zone_id,
            slot_number: s.slot_number,
            status: s.status,
            session_id: s.session_id,
            ticket_number: s.ticket_number,
            plate_number: s.plate_number,
            zone_name: z.name,
            zone_code: z.code,
          }))
      );
      setOccSlots(rows.sort((a, b) => a.slot_number.localeCompare(b.slot_number)));
    } catch {
      setOccSlots([]);
    } finally {
      setOccLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOccupied();
  }, [loadOccupied]);

  const doLookup = useCallback(async (term: string) => {
    const needle = term.trim();
    if (!needle) return;
    setLooking(true);
    setError(null);
    setLookup(null);
    setMatches(null);
    try {
      const res = await apiGet<LookupResponse>(`/api/membership/parking/sessions/exit?q=${encodeURIComponent(needle)}`);
      if (res.matches) {
        setMatches(res.matches);
      } else if (res.session) {
        setLookup(res);
        idemKey.current = crypto.randomUUID();
        setLostTicket(false);
        setDiscountType("");
        setDiscountValue("");
        setOverrideAmount("");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLooking(false);
    }
  }, []);

  // Prefill from dashboard/live-map links (?q=plate)
  useEffect(() => {
    const pre = params.get("q");
    if (pre) {
      setQ(pre);
      doLookup(pre);
    }
  }, [params, doLookup]);

  const settle = async () => {
    if (!lookup?.session) return;
    setSettleLoading(true);
    try {
      const res = await apiPost<ExitResult>("/api/membership/parking/sessions/exit", {
        session_id: lookup.session.id,
        payment_method: method,
        reference: reference || undefined,
        lost_ticket: lostTicket || undefined,
        idempotency_key: idemKey.current,
        discount:
          discountType && discountValue
            ? { discount_type: discountType, value: Number(discountValue), code: null, reason: discountReason || null }
            : undefined,
        override_amount: overrideAmount !== "" ? Number(overrideAmount) : undefined,
        override_reason: overrideReason || undefined,
      });
      setReceipt(res);
      setLookup(null);
      setQ("");
      setReference("");
      loadOccupied();
      toast.success(
        res.idempotent ? "Already settled" : `Exit complete — ${fmtMoney(res.payment.amount, res.pricing.currency)}`,
        `Receipt ${res.payment.receipt_number} · space released`
      );
    } catch (e: any) {
      toast.error("Exit failed", e.message);
    } finally {
      setSettleLoading(false);
    }
  };

  const finishAddisPaySuccess = useCallback(
    (sessionId: number | null) => {
      setAdp(null);
      setAdpQr(null);
      setAdpStatus(null);
      setLookup(null);
      setQ("");
      setReference("");
      loadOccupied();
      toast.success("Payment received", "Exit complete - space released");
      if (sessionId) doLookup(String(sessionId));
    },
    [doLookup, loadOccupied]
  );

  const startAddisPay = async () => {
    if (!lookup?.session || !pricing) return;
    setAdpBusy(true);
    try {
      const res = await apiPost<{
        status: string;
        tx_ref?: string;
        checkout_url?: string;
        amount?: number;
        currency?: string;
        message?: string;
      }>("/api/membership/parking/addispay/initialize", {
        session_id: lookup.session.id,
        phone_number: session?.owner_phone || undefined,
        email: session?.owner_email || undefined,
        return_url: `/dashboard/membership/parking/exit?addispay=pending&session=${lookup.session.id}`,
      });
      if (res.status === "success" && res.checkout_url && res.tx_ref) {
        setAdp({
          tx_ref: res.tx_ref,
          checkout_url: res.checkout_url,
          amount: res.amount ?? pricing.amountDue,
          currency: res.currency ?? pricing.currency,
        });
        setAdpStatus("pending");
        try {
          const QRCode = (await import("qrcode")).default;
          setAdpQr(await QRCode.toDataURL(res.checkout_url, { width: 280, margin: 1 }));
        } catch {
          setAdpQr(null);
        }
        window.open(res.checkout_url, "_blank", "noopener");
      } else {
        toast.error("AddisPay", res.message || "Could not start the online payment");
      }
    } catch (e: any) {
      toast.error("AddisPay", e.message);
    } finally {
      setAdpBusy(false);
    }
  };

  const checkAddisPay = useCallback(
    async (silent = false) => {
      if (!adp) return;
      try {
        const res = await apiGet<{ status: string; message?: string; session_id?: number | null }>(
          `/api/membership/parking/addispay/verify/${encodeURIComponent(adp.tx_ref)}`
        );
        if (res.status === "success") {
          finishAddisPaySuccess(res.session_id ?? lookup?.session?.id ?? null);
        } else {
          setAdpStatus(res.status || "pending");
          if (!silent) toast.info("AddisPay", res.status === "pending" ? "Waiting for the payment to complete..." : res.message || "Not completed yet");
        }
      } catch (e: any) {
        if (!silent) toast.error("AddisPay", e.message);
      }
    },
    [adp, finishAddisPaySuccess, lookup?.session?.id]
  );

  // Auto-poll AddisPay while a checkout is open.
  useEffect(() => {
    if (!adp) return;
    pollRef.current = window.setInterval(() => checkAddisPay(true), 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [adp, checkAddisPay]);

  // Handle the gateway redirect back (?addispay=success&session=...)
  useEffect(() => {
    const flag = params.get("addispay");
    const sid = params.get("session");
    if (flag === "success") {
      if (sid) doLookup(sid);
      loadOccupied();
      toast.success("Payment received", "Exit complete - space released");
    } else if (flag && flag !== "pending") {
      toast.error("AddisPay", `Payment ${flag}`);
    }
  }, [params]);

  // Keep mode + method in sync with the ?mode= query param (sidebar links).
  useEffect(() => {
    const m = params.get("mode");
    if (m === "self" || m === "cashier") {
      setMode(m);
      setMethod((prev) => (m === "self" ? "addispay" : prev === "addispay" ? "cash" : prev));
    }
  }, [params]);

  const pricing = lookup?.pricing;
  const session = lookup?.session;
  const perms = lookup?.permissions;

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Vehicle Exit</h1>
        <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
          {mode === "self"
            ? "Self checkout - scan the customer QR, confirm the fee and let them pay online."
            : "Cashier / attendant exit - search by ticket, plate or scan the customer QR."}
        </p>
        <div className="mt-3 max-w-md">
          <Segmented
            options={[
              { value: "self", label: "Self checkout" },
              { value: "cashier", label: "Cashier / Attendant" },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setMethod((prev) => (v === "self" ? "addispay" : prev === "addispay" ? "cash" : prev));
            }}
          />
        </div>
      </div>

      {/* ------------------------------- search ------------------------------ */}
      <Card className="mb-4">
        <form
          className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            doLookup(q);
          }}
        >
          <div className="relative w-full sm:min-w-[240px] sm:flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <Input
              autoFocus
              inputMode="text"
              autoCapitalize="characters"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ticket (TKT-...), plate (ABC-123) or slot"
              aria-label="Ticket, plate or slot"
              className="h-12 pl-9 text-base sm:h-11 sm:text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="md" loading={looking} icon={<Search size={15} />} disabled={!q.trim()} className="flex-1 sm:flex-none">
              Find session
            </Button>
            <Button type="button" size="md" variant={scanOpen ? "secondary" : "outline"} icon={<ScanLine size={15} />} onClick={() => setScanOpen((v) => !v)} className="flex-1 sm:flex-none">
              {scanOpen ? "Close scanner" : "Scan QR"}
            </Button>
          </div>
        </form>
        {scanOpen && (
          <QrScanner
            onScan={(text) => {
              setScanOpen(false);
              let needle = text.trim();
              try {
                const parsed = JSON.parse(text);
                needle = parsed.ticket_number || parsed.t || (parsed.session_id ? String(parsed.session_id) : needle);
              } catch {}
              setQ(needle);
              doLookup(needle);
            }}
            onClose={() => setScanOpen(false)}
          />
        )}
      </Card>

      {/* ---------------------------- occupied spaces ------------------------ */}
      {!lookup && (
        <Card className="mb-4">
          <CardHeader icon={<Grid3x3 size={16} />} title="Occupied spaces" subtitle="Tap a space to load its active stay" />
          <div className="px-4 py-4 sm:px-5">
            {occLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : occSlots.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-[var(--text-tertiary)]">No vehicles are currently parked.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {occSlots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setQ(s.ticket_number || String(s.session_id));
                      doLookup(String(s.session_id));
                    }}
                    className="flex h-16 flex-col items-center justify-center rounded-xl border-2 border-red-500/25 bg-red-500/10 px-1 text-red-600 transition-all select-none hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] active:scale-[0.97] dark:text-red-400"
                  >
                    <span className="pk-num text-[15px] font-bold leading-none">{s.slot_number}</span>
                    <span className="mt-1 w-full truncate text-center text-[10px] font-medium">{s.plate_number || "-"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ----------------------------- multi-match --------------------------- */}
      {matches && (
        <Card className="mb-4">
          <CardHeader icon={<Ticket size={16} />} title="Multiple sessions match" subtitle="Pick the stay this vehicle is exiting" />
          <ul className="p-2">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => doLookup(String(m.id))}
                  className="flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <Badge tone={m.status === "active" ? "success" : "neutral"} dot>{m.status}</Badge>
                  <span className="font-semibold text-[var(--text-primary)]">{m.plate_number}</span>
                  <span className="pk-num text-[var(--text-tertiary)]">{m.ticket_number}</span>
                  <span className="ml-auto text-xs text-[var(--text-tertiary)]">entered {relativeTime(m.entry_time)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--accent-red)]">
              <AlertTriangle size={15} /> {error}
            </p>
            <Button size="sm" variant="outline" onClick={() => doLookup(q)}>Retry</Button>
          </div>
        </Card>
      )}

      {/* ---------------------------- settlement ----------------------------- */}
      {lookup && session && pricing && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* stay details */}
          <Card className="lg:col-span-3">
            <CardHeader
              icon={<Clock size={16} />}
              title={`${session.plate_number || "Unknown plate"} — stay summary`}
              subtitle={`Ticket ${session.ticket_number}`}
              actions={<Badge tone={pricing.covered ? "purple" : "success"} dot>{pricing.covered ? "covered by agreement" : "active stay"}</Badge>}
            />
            <div className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Entered" value={fmtDateTime(session.entry_time)} />
                <Stat label="Parked for" value={fmtDuration(pricing.fee.durationMinutes)} />
                <Stat label="Space" value={session.slot_number ? `${session.zone_name ?? ""} · ${session.slot_number}` : "—"} />
                <Stat label="Tariff" value={pricing.tariffName ?? "Fallback (30 ETB / 30 min)"} />
              </div>

              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-sunken)] px-4 py-4">
                <p className="mb-2.5 text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Fee breakdown</p>
                {pricing.fee.breakdown.length === 0 && <p className="text-[13px] text-[var(--text-tertiary)]">{pricing.fee.note ?? "No charge"}</p>}
                <ul className="space-y-1.5">
                  {pricing.fee.breakdown.map((b, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-4 text-[13px]">
                      <span className="text-[var(--text-secondary)]">{b.label}</span>
                      <span className="pk-num font-medium">{b.amount === 0 ? "—" : fmtMoney(b.amount, pricing.currency)}</span>
                    </li>
                  ))}
                  {pricing.discountAmount > 0 && (
                    <li className="flex items-baseline justify-between gap-4 text-[13px] text-emerald-600 dark:text-emerald-400">
                      <span>Discount applied</span>
                      <span className="pk-num font-semibold">− {fmtMoney(pricing.discountAmount, pricing.currency)}</span>
                    </li>
                  )}
                </ul>
                <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-[var(--card-border)] pt-3">
                  <span className="text-[13px] font-bold text-[var(--text-primary)]">Amount due</span>
                  <span className="pk-num text-xl font-bold text-[var(--primary)]">{fmtMoney(pricing.amountDue, pricing.currency)}</span>
                </div>
                {pricing.fee.note && <p className="mt-2 text-[11.5px] italic text-[var(--text-tertiary)]">{pricing.fee.note}</p>}
              </div>

              <dl className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                <div className="flex justify-between gap-3 border-b border-[var(--card-border)] pb-2">
                  <dt className="text-[var(--text-tertiary)]">Vehicle</dt>
                  <dd className="font-medium capitalize">{session.vehicle_type || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-[var(--card-border)] pb-2">
                  <dt className="text-[var(--text-tertiary)]">Owner</dt>
                  <dd className="font-medium">{session.owner_name || session.customer_name || "—"}</dd>
                </div>
              </dl>
            </div>
          </Card>

          {/* payment */}
          <Card className="lg:col-span-2">
            <CardHeader icon={<Banknote size={16} />} title="Settle & release" subtitle="Payment is recorded atomically with the exit" />
            <div className="space-y-4 px-5 py-5">
              {pricing.covered ? (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3 text-[13px] text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)]">Covered by {pricing.covered.label}</p>
                  <p className="mt-0.5">Valid until {String(pricing.covered.end_date).slice(0, 10)}. No payment required — confirm exit to release the space.</p>
                </div>
              ) : mode === "self" ? (
                <>
                  <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-sunken)] px-4 py-4 text-center">
                    <p className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Amount to pay</p>
                    <p className="pk-num mt-1 text-3xl font-bold text-[var(--primary)]">{fmtMoney(pricing.amountDue, pricing.currency)}</p>
                  </div>
                  <Field label="Payment method" required>
                    <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
                      <option value="addispay">AddisPay (online / QR)</option>
                      <option value="cash">Cash</option>
                      <option value="telebirr">Telebirr</option>
                      <option value="cbebirr">CBE Birr</option>
                      <option value="chapa">Chapa</option>
                      <option value="pos">POS terminal</option>
                    </Select>
                  </Field>
                  {method === "addispay" ? (
                    <>
                      <Button size="lg" className="w-full" loading={adpBusy} onClick={startAddisPay} icon={<QrCode size={17} />}>
                        Pay {fmtMoney(pricing.amountDue, pricing.currency)} with AddisPay
                      </Button>
                      <p className="text-center text-[11px] text-[var(--text-tertiary)]">
                        Opens the AddisPay checkout in a new tab. The space is released automatically once payment is confirmed.
                      </p>
                    </>
                  ) : (
                    <Field label="Reference (optional)" hint="Receipt number or phone">
                      <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Field label="Payment method" required>
                    <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
                      {METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Reference / transaction id" hint="Receipt number, phone or gateway reference">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
                  </Field>

                  <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--card-border)] px-3.5 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">Lost ticket</p>
                      <p className="text-[11.5px] text-[var(--text-tertiary)]">Charges the flat lost-ticket fee instead of the duration fee.</p>
                    </div>
                    <Switch checked={lostTicket} onChange={setLostTicket} label="Lost ticket" />
                  </div>

                  {perms?.canDiscount && (
                    <div className="rounded-xl border border-[var(--card-border)] px-3.5 py-3">
                      <p className="mb-2 text-[12px] font-semibold text-[var(--text-primary)]">Discount <span className="font-normal text-[var(--text-tertiary)]">(audited)</span></p>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} aria-label="Discount type">
                          <option value="">No discount</option>
                          <option value="amount">Fixed amount</option>
                          <option value="percent">Percent</option>
                        </Select>
                        <Input
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!discountType}
                          placeholder={discountType === "percent" ? "%" : "0.00"}
                          aria-label="Discount value"
                        />
                      </div>
                      {discountType && (
                        <Input className="mt-2" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason (required for audit)" aria-label="Discount reason" />
                      )}
                    </div>
                  )}

                  {perms?.canOverride && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3">
                      <p className="mb-2 text-[12px] font-semibold text-[var(--text-primary)]">Manual fee override <span className="font-normal text-[var(--text-tertiary)]">(supervisor only — audited)</span></p>
                      <Input
                        value={overrideAmount}
                        onChange={(e) => setOverrideAmount(e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`Replace ${fmtMoney(pricing.amountDue, pricing.currency)} with…`}
                        aria-label="Override amount"
                      />
                      {overrideAmount !== "" && (
                        <Input className="mt-2" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason (required for audit)" aria-label="Override reason" />
                      )}
                    </div>
                  )}
                </>
              )}

              {mode === "cashier" && (
                <div className="flex items-center justify-between rounded-xl bg-[var(--primary-soft)] px-4 py-3">
                  <span className="text-[13px] font-bold text-[var(--text-primary)]">Collect now</span>
                  <span className="pk-num text-lg font-bold text-[var(--primary)]">{fmtMoney(pricing.amountDue, pricing.currency)}</span>
                </div>
              )}

              {(pricing.covered || mode === "cashier" || (mode === "self" && method !== "addispay")) && (
                <Button
                  size="lg"
                  variant="success"
                  className="w-full"
                  loading={settleLoading}
                  onClick={settle}
                  icon={<DoorOpen size={17} />}
                >
                  {pricing.covered
                    ? "Confirm exit & release space"
                    : mode === "self"
                      ? "Confirm payment & release space"
                      : "Confirm exit & release space"}
                </Button>
              )}
              <p className="text-center text-[11px] text-[var(--text-tertiary)]">
                Idempotent — retrying can never charge twice.
              </p>
            </div>
          </Card>
        </div>
      )}

      {!lookup && !matches && !error && !looking && (
        <Card>
          <EmptyState
            icon={<Ticket size={22} />}
            title="Search for an active stay"
            body="Enter the ticket number from the windshield ticket, the license plate, or scan the QR code. The server computes the fee from the configured tariff — the client never invents amounts."
            action={
              <Link href="/dashboard/membership/parking/sessions?status=active">
                <Button variant="outline" size="sm">Browse active sessions</Button>
              </Link>
            }
          />
        </Card>
      )}

      {looking && (
        <Card className="p-5">
          <div className="space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-24" />
            <Skeleton className="h-10 w-40" />
          </div>
        </Card>
      )}

      {/* ------------------------------ receipt ------------------------------ */}
      {receipt && <ReceiptDialog result={receipt} onClose={() => setReceipt(null)} />}

      {/* --------------------------- AddisPay checkout ----------------------- */}
      {adp && (
        <Dialog
          open
          onClose={() => { setAdp(null); setAdpQr(null); }}
          title="AddisPay checkout"
          subtitle={`Pay ${fmtMoney(adp.amount, adp.currency)} to complete the exit`}
        >
          <div className="flex flex-col items-center gap-4">
            {adpQr ? (
              <img src={adpQr} alt="AddisPay checkout QR" className="h-56 w-56 rounded-xl border border-[var(--card-border)] bg-white p-2" />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-dashed border-[var(--card-border)] text-[var(--text-tertiary)]">
                <QrCode size={40} />
              </div>
            )}
            <p className="text-center text-[12.5px] text-[var(--text-secondary)]">
              Ask the customer to scan this QR (or use the checkout page already opened) and pay
              <span className="pk-num font-bold text-[var(--text-primary)]"> {fmtMoney(adp.amount, adp.currency)}</span>.
              This dialog closes automatically once payment is confirmed.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[var(--text-tertiary)]">
              <span>Reference</span>
              <span className="pk-num font-semibold text-[var(--text-secondary)]">{adp.tx_ref}</span>
              <Badge tone={adpStatus === "success" ? "success" : "warning"} dot>{adpStatus || "pending"}</Badge>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={() => window.open(adp.checkout_url, "_blank", "noopener")}>
              Open checkout page
            </Button>
            <Button className="flex-1" onClick={() => checkAddisPay(false)}>
              I have paid / Check status
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* --------------------------------- pieces --------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] px-3.5 py-3">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function ReceiptDialog({ result, onClose }: { result: ExitResult; onClose: () => void }) {
  const p = result.pricing;
  return (
    <>
      <div className="pk-print-area hidden">
        <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>PARKING RECEIPT</strong>
          <div style={{ fontSize: 11 }}>{result.payment.receipt_number}</div>
        </div>
        <table style={{ width: "100%", fontSize: 12 }}>
          <tbody>
            <tr><td>Ticket</td><td style={{ textAlign: "right" }}>{result.session.ticket_number}</td></tr>
            <tr><td>Plate</td><td style={{ textAlign: "right", fontWeight: 700 }}>{result.session.plate_number}</td></tr>
            <tr><td>Entered</td><td style={{ textAlign: "right" }}>{fmtDateTime(result.session.entry_time)}</td></tr>
            <tr><td>Exited</td><td style={{ textAlign: "right" }}>{fmtDateTime(result.session.exit_time)}</td></tr>
            <tr><td>Duration</td><td style={{ textAlign: "right" }}>{fmtDuration(p.fee.durationMinutes)}</td></tr>
          </tbody>
        </table>
        <table style={{ width: "100%", fontSize: 12, marginTop: 10, borderTop: "1px dashed #000", paddingTop: 8 }}>
          <tbody>
            {p.fee.breakdown.map((b, i) => (
              <tr key={i}><td>{b.label}</td><td style={{ textAlign: "right" }}>{b.amount === 0 ? "—" : fmtMoney(b.amount, p.currency)}</td></tr>
            ))}
            {p.discountAmount > 0 && (
              <tr><td>Discount</td><td style={{ textAlign: "right" }}>− {fmtMoney(p.discountAmount, p.currency)}</td></tr>
            )}
          </tbody>
        </table>
        <table style={{ width: "100%", fontSize: 14, marginTop: 10, borderTop: "2px solid #000", paddingTop: 8, fontWeight: 700 }}>
          <tbody>
            <tr><td>TOTAL PAID ({result.payment.payment_method})</td><td style={{ textAlign: "right" }}>{fmtMoney(result.payment.amount, p.currency)}</td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 12, fontSize: 11, textAlign: "center" }}>
          Receipt {result.payment.receipt_number} · Thank you for parking with us.
        </p>
      </div>

      <div className="pk-overlay fixed inset-0 z-[70] flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="pk-dialog w-full max-w-md overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-lg)]">
          <div className="flex flex-col items-center border-b border-[var(--card-border)] bg-emerald-500/5 px-6 py-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckCircle2 size={24} />
            </span>
            <h2 className="mt-2.5 text-base font-bold text-[var(--text-primary)]">Exit complete</h2>
            <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">
              {result.payment.amount > 0 ? `${fmtMoney(result.payment.amount, p.currency)} collected via ${result.payment.payment_method}` : "No payment due"}
              {result.slot_released ? " · space released" : ""}
            </p>
          </div>
          <div className="px-6 py-4">
            <div className="rounded-xl border border-[var(--card-border)] p-4 text-[13px]">
              <div className="flex justify-between border-b border-[var(--card-border)] pb-2">
                <span className="text-[var(--text-tertiary)]">Receipt</span>
                <span className="pk-num font-bold">{result.payment.receipt_number}</span>
              </div>
              <div className="mt-2 flex justify-between border-b border-[var(--card-border)] pb-2">
                <span className="text-[var(--text-tertiary)]">Plate / ticket</span>
                <span className="font-semibold">{result.session.plate_number} · {result.session.ticket_number}</span>
              </div>
              <div className="mt-2 flex justify-between border-b border-[var(--card-border)] pb-2">
                <span className="text-[var(--text-tertiary)]">Stay</span>
                <span className="font-medium">{fmtDateTime(result.session.entry_time)} → {fmtDateTime(result.session.exit_time)}</span>
              </div>
              <div className="mt-2 flex justify-between border-b border-[var(--card-border)] pb-2">
                <span className="text-[var(--text-tertiary)]">Gross / discount</span>
                <span className="pk-num font-medium">{fmtMoney(p.grossAmount, p.currency)} / − {fmtMoney(p.discountAmount, p.currency)}</span>
              </div>
              <div className="mt-3 flex justify-between">
                <span className="font-bold text-[var(--text-primary)]">Paid</span>
                <span className="pk-num text-base font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(result.payment.amount, p.currency)}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 border-t border-[var(--card-border)] px-5 py-3.5">
            <Button variant="outline" size="md" className="flex-1" icon={<Printer size={15} />} onClick={() => window.print()}>
              Print receipt
            </Button>
            <Button size="md" className="flex-1" onClick={onClose}>
              Next vehicle
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* -------------------------------- QR scanner ------------------------------ */

function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [containerId] = useState(() => `qr-${Math.random().toString(36).slice(2)}`);
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let scanner: any = null;
    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new mod.Html5Qrcode(containerId, { verbose: false });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded: string) => {
            onScan(decoded);
          },
          () => {}
        );
        if (!cancelled) setReady(true);
        startedRef.current = true;
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access or type the ticket number instead."
              : `Camera unavailable in this environment — ${e?.message || "no compatible device found"}. Type the ticket number instead.`
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      if (scanner && startedRef.current) {
        scanner.stop().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="border-t border-[var(--card-border)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {error ? (
            <p className="flex items-start gap-2 text-[13px] text-[var(--accent-amber)]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
            </p>
          ) : (
            <>
              <div id={containerId} className="mx-auto max-w-[280px] overflow-hidden rounded-xl border border-[var(--card-border)] bg-black" />
              <p className="mt-2 text-center text-[11.5px] text-[var(--text-tertiary)]">
                {ready ? "Point the camera at the ticket QR code" : "Starting camera…"}
              </p>
            </>
          )}
        </div>
        <button onClick={onClose} aria-label="Close scanner" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
