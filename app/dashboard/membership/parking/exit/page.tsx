"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, BadgeCheck, Banknote, CheckCircle2, Clock, DoorOpen, Printer, QrCode,
  ScanLine, Search, Ticket, X,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Skeleton, Switch,
  cn, fmtDateTime, fmtDuration, fmtMoney, relativeTime, useToast,
} from "@/lib/ui";
import { apiFetch, apiGet, apiPost } from "@/lib/client";

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

  const [method, setMethod] = useState("cash");
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
  const idemKey = useRef<string>("");

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

  const pricing = lookup?.pricing;
  const session = lookup?.session;
  const perms = lookup?.permissions;

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Vehicle Exit</h1>
        <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
          Search by ticket number, plate or scan the QR — fees are always computed server-side from the active tariff.
        </p>
      </div>

      {/* ------------------------------- search ------------------------------ */}
      <Card className="mb-4">
        <form
          className="flex flex-wrap items-end gap-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            doLookup(q);
          }}
        >
          <div className="relative min-w-[240px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ticket number (TKT-…), plate (ABC-123) or session id"
              aria-label="Ticket or plate"
              className="h-11 pl-9"
            />
          </div>
          <Button type="submit" size="md" loading={looking} icon={<Search size={15} />} disabled={!q.trim()}>
            Find session
          </Button>
          <Button type="button" size="md" variant={scanOpen ? "secondary" : "outline"} icon={<ScanLine size={15} />} onClick={() => setScanOpen((v) => !v)}>
            {scanOpen ? "Close scanner" : "Scan QR"}
          </Button>
        </form>
        {scanOpen && (
          <QrScanner
            onScan={(text) => {
              setScanOpen(false);
              let needle = text.trim();
              try {
                const parsed = JSON.parse(text);
                needle = parsed.ticket_number || (parsed.session_id ? String(parsed.session_id) : needle);
              } catch {}
              setQ(needle);
              doLookup(needle);
            }}
            onClose={() => setScanOpen(false)}
          />
        )}
      </Card>

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

              <div className="flex items-center justify-between rounded-xl bg-[var(--primary-soft)] px-4 py-3">
                <span className="text-[13px] font-bold text-[var(--text-primary)]">Collect now</span>
                <span className="pk-num text-lg font-bold text-[var(--primary)]">{fmtMoney(pricing.amountDue, pricing.currency)}</span>
              </div>

              <Button
                size="lg"
                variant="success"
                className="w-full"
                loading={settleLoading}
                onClick={settle}
                icon={<DoorOpen size={17} />}
              >
                Confirm exit & release space
              </Button>
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
