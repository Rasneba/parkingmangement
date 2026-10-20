"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowUpFromLine, Banknote, CheckCircle2, Nfc, Printer, RefreshCw, Receipt, ScanLine,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, Dialog, EmptyState, Field, Input,
  Segmented, Select, Skeleton, Textarea, fmtDate, fmtDateTime, fmtInt, fmtMoney, relativeTime, useToast,
  type Column,
} from "@/lib/ui";
import { apiGet, apiPost, apiPut } from "@/lib/client";
import { createWebNfcReader, isWebNfcSupported } from "@/lib/web-nfc";
import { normalizeCardUid } from "@/lib/card-uid";

interface Shift {
  id: number;
  shift_code: string;
  operator_id: number;
  operator_name?: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: string;
  closing_cash: string | null;
  expected_cash: string | null;
  cash_difference: string | null;
  total_transactions: number | null;
  total_collected: string | null;
  status: string;
  notes?: string | null;
  cash_collected?: string;
  transactions?: number;
  total_collected_live?: string;
  movements_net?: string;
}
interface Movement { id: number; movement_type: string; amount: string; reason: string | null; performed_by_name?: string; created_at: string }
interface PaymentRow {
  id: number; session_id: number; amount: string; currency: string; payment_method: string;
  reference: string | null; receipt_number: string | null; payment_date: string;
  ticket_number?: string; plate_number?: string | null;
}
interface Refund {
  id: number; amount: string; reason: string; status: string; created_at: string;
  payment_amount?: string; payment_method?: string; receipt_number?: string | null;
  ticket_number?: string | null; plate_number?: string | null;
  requested_by_name?: string; authorized_by_name?: string;
}
interface ShiftDetail { shift: Shift; movements: Movement[]; paymentSummary: Array<{ payment_method: string; tx: number; total: number }> }

interface NfcSubscription {
  id: number;
  plan_type: string | null;
  start_date: string;
  end_date: string;
  amount: string;
  status: string;
  auto_renew: boolean;
  plan_name: string | null;
  plan_category: string | null;
  duration_days: number | null;
  is_current: boolean;
  days_remaining: number;
}

interface NfcLookupResult {
  found: boolean;
  error?: string;
  message?: string;
  card?: { id: number; uid: string; label: string | null; status: string; last_used_at: string | null };
  member?: {
    id: number;
    full_name: string;
    phone: string | null;
    email: string | null;
    customer_id: string | null;
    status: string;
    start_date: string;
    end_date: string;
    photo_url: string | null;
  };
  vehicles?: Array<{
    id: number;
    plate_number: string;
    vehicle_type: string;
    vehicle_model: string | null;
    vehicle_color: string | null;
    is_blacklisted: boolean;
  }>;
  subscription?: NfcSubscription | null;
  subscriptions?: NfcSubscription[];
  remaining_days?: number;
}

const METHODS = ["cash", "telebirr", "cbebirr", "chapa", "addispay", "bank", "pos", "credit_card", "debit_card"];

export default function CashierPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"shift" | "nfc" | "payments" | "refunds">("shift");

  const [current, setCurrent] = useState<Shift | null>(null);
  const [currentLoading, setCurrentLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [payDate, setPayDate] = useState("");

  // shift open / close forms
  const [openingCash, setOpeningCash] = useState("0");
  const [openBusy, setOpenBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [movement, setMovement] = useState({ type: "cash_out", amount: "", reason: "" });

  const [receipt, setReceipt] = useState<PaymentRow | null>(null);
  const [resolveRefund, setResolveRefund] = useState<{ refund: Refund; action: "approve" | "reject" | "process" } | null>(null);

  const loadCurrent = useCallback(async () => {
    setCurrentLoading(true);
    try {
      const res = await apiGet<{ shift: Shift | null }>("/api/membership/parking/shifts?current=1");
      setCurrent(res.shift);
    } catch {
      setCurrent(null);
    } finally {
      setCurrentLoading(false);
    }
  }, []);
  const loadShifts = useCallback(async () => {
    try {
      setShifts(await apiGet<Shift[]>("/api/membership/parking/shifts?limit=50"));
    } catch {
      setShifts([]);
    }
  }, []);
  const loadPayments = useCallback(async () => {
    setPayError(null);
    try {
      const sp = new URLSearchParams({ limit: "200" });
      if (payMethod) sp.set("method", payMethod);
      if (payDate) sp.set("date", payDate);
      setPayments(await apiGet<PaymentRow[]>(`/api/membership/parking/payments?${sp}`));
    } catch (e: any) {
      setPayError(e.message);
      setPayments([]);
    }
  }, [payMethod, payDate]);
  const loadRefunds = useCallback(async () => {
    try {
      setRefunds(await apiGet<Refund[]>("/api/membership/parking/refunds?limit=100"));
    } catch {
      setRefunds([]);
    }
  }, []);

  useEffect(() => {
    loadCurrent();
    loadShifts();
  }, [loadCurrent, loadShifts]);
  useEffect(() => {
    loadPayments();
  }, [loadPayments]);
  useEffect(() => {
    if (tab === "refunds") loadRefunds();
  }, [tab, loadRefunds]);

  const openShift = async () => {
    setOpenBusy(true);
    try {
      await apiPost("/api/membership/parking/shifts", { opening_cash: Number(openingCash) || 0 });
      toast.success("Shift opened", `Opening float ${fmtMoney(Number(openingCash) || 0)}`);
      loadCurrent();
      loadShifts();
    } catch (e: any) {
      toast.error("Could not open shift", e.message);
    } finally {
      setOpenBusy(false);
    }
  };

  const closeShift = async () => {
    if (!current) return;
    setCloseBusy(true);
    try {
      const res = await apiPut<Shift>(`/api/membership/parking/shifts/${current.id}`, {
        action: "close",
        closing_cash: Number(closingCash) || 0,
        notes: closeNotes || undefined,
      });
      const diff = Number(res.cash_difference);
      toast.success(
        `Shift ${res.shift_code} closed`,
        Math.abs(diff) < 0.005 ? "Cash reconciled perfectly" : `Difference: ${diff > 0 ? "+" : ""}${fmtMoney(diff)}`
      );
      setCloseOpen(false);
      setClosingCash("");
      setCloseNotes("");
      loadCurrent();
      loadShifts();
    } catch (e: any) {
      toast.error("Could not close shift", e.message);
    } finally {
      setCloseBusy(false);
    }
  };

  const addMovement = async () => {
    if (!current) return;
    try {
      await apiPut(`/api/membership/parking/shifts/${current.id}`, {
        action: "movement",
        movement_type: movement.type,
        amount: Number(movement.amount),
        reason: movement.reason || undefined,
      });
      toast.success(`${movement.type.replace("_", " ")} recorded`);
      setMovement({ type: "cash_out", amount: "", reason: "" });
      loadCurrent();
      if (detail) openDetail(current.id);
    } catch (e: any) {
      toast.error("Movement failed", e.message);
    }
  };

  const openDetail = async (id: number) => {
    try {
      setDetail(await apiGet<ShiftDetail>(`/api/membership/parking/shifts/${id}`));
    } catch (e: any) {
      toast.error("Could not load shift", e.message);
    }
  };

  const resolveRefundAction = async () => {
    if (!resolveRefund) return;
    try {
      await apiPut("/api/membership/parking/refunds", { id: resolveRefund.refund.id, action: resolveRefund.action });
      toast.success(`Refund ${resolveRefund.action === "reject" ? "rejected" : resolveRefund.action + "d"}`);
      setResolveRefund(null);
      loadRefunds();
    } catch (e: any) {
      toast.error("Action failed", e.message);
    }
  };

  const paymentColumns: Column<PaymentRow>[] = [
    { key: "receipt_number", label: "Receipt", render: (p) => <span className="pk-num font-semibold">{p.receipt_number || `#${p.id}`}</span> },
    { key: "plate", label: "Vehicle", render: (p) => p.plate_number || "—" },
    { key: "ticket", label: "Ticket", hideBelow: "md", render: (p) => <span className="pk-num text-[var(--text-tertiary)]">{p.ticket_number || "—"}</span> },
    { key: "method", label: "Method", render: (p) => <Badge tone={p.payment_method === "cash" ? "success" : "info"}>{p.payment_method.replace(/_/g, " ")}</Badge> },
    { key: "reference", label: "Reference", hideBelow: "lg", render: (p) => p.reference || "—" },
    { key: "payment_date", label: "When", render: (p) => <span title={fmtDateTime(p.payment_date)}>{relativeTime(p.payment_date)}</span> },
    { key: "amount", label: "Amount", align: "right", render: (p) => <span className="pk-num font-bold">{fmtMoney(p.amount, p.currency)}</span> },
    {
      key: "actions", label: "", align: "right", render: (p) => (
        <Button size="xs" variant="ghost" icon={<Printer size={13} />} onClick={() => setReceipt(p)} aria-label={`Reprint receipt ${p.receipt_number}`}>Receipt</Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Cashier & Shifts</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Payments, shift reconciliation and refund authorization.</p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "shift", label: <>Shift</> },
            { value: "nfc", label: <>NFC lookup</> },
            { value: "payments", label: <>Payments</> },
            { value: "refunds", label: <>Refunds{(refunds ?? []).filter((r) => r.status === "pending").length > 0 && <Badge tone="warning" className="ml-1.5">{(refunds ?? []).filter((r) => r.status === "pending").length}</Badge>}</> },
          ]}
        />
      </div>

      {/* ------------------------------- shift tab ------------------------------ */}
      {tab === "shift" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader icon={<Banknote size={16} />} title="Your shift" subtitle={current ? `Shift ${current.shift_code} · opened ${relativeTime(current.opened_at)}` : "No open shift"} />
            {currentLoading ? (
              <div className="p-5"><Skeleton className="h-28" /></div>
            ) : !current ? (
              <div className="px-5 py-6">
                <p className="mb-4 text-[13px] text-[var(--text-secondary)]">
                  Open a shift with your opening cash float. Payments are attributed and reconciled when you close.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Opening cash float"><Input type="number" min="0" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="w-40" /></Field>
                  <Button size="md" icon={<ArrowUpFromLine size={15} />} loading={openBusy} onClick={openShift}>Open shift</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-5">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Opening float" value={fmtMoney(current.opening_cash)} />
                  <Stat label="Cash collected" value={fmtMoney(current.cash_collected ?? 0)} />
                  <Stat label="All payments" value={fmtMoney(current.total_collected_live ?? 0)} />
                  <Stat label="Transactions" value={fmtInt(current.transactions ?? 0)} />
                </div>
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--card-border)] p-4">
                  <Field label="Movement type">
                    <Select value={movement.type} onChange={(e) => setMovement((m) => ({ ...m, type: e.target.value }))} className="w-[130px]">
                      {["cash_in", "cash_out", "float", "pickup", "drop"].map((t) => <option key={t} value={t} className="capitalize">{t.replace("_", " ")}</option>)}
                    </Select>
                  </Field>
                  <Field label="Amount"><Input type="number" min="0" step="0.01" value={movement.amount} onChange={(e) => setMovement((m) => ({ ...m, amount: e.target.value }))} className="w-32" /></Field>
                  <Field label="Reason" className="min-w-[160px] flex-1"><Input value={movement.reason} onChange={(e) => setMovement((m) => ({ ...m, reason: e.target.value }))} placeholder="e.g. paid supplier" /></Field>
                  <Button variant="outline" size="md" onClick={addMovement} disabled={!movement.amount}>Record</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" size="md" icon={<ArrowDownToLine size={15} />} onClick={() => { setClosingCash(""); setCloseOpen(true); }}>Close & reconcile</Button>
                  <Button variant="outline" size="md" icon={<RefreshCw size={14} />} onClick={() => { loadCurrent(); loadShifts(); }}>Refresh</Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent shifts" subtitle="Closed and reconciled history" />
            {!shifts ? (
              <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : shifts.length === 0 ? (
              <EmptyState icon={<Receipt size={18} />} title="No shifts yet" body="Open a shift to start tracking cash." />
            ) : (
              <ul className="divide-y divide-[var(--card-border)]">
                {shifts.slice(0, 12).map((s) => {
                  const diff = s.cash_difference != null ? Number(s.cash_difference) : null;
                  return (
                    <li key={s.id}>
                      <button onClick={() => openDetail(s.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left text-[13px] transition-colors hover:bg-[var(--surface-sunken)]">
                        <span className="pk-num font-semibold">{s.shift_code}</span>
                        <span className="text-[var(--text-tertiary)]">{s.operator_name || `op #${s.operator_id}`}</span>
                        <span className="ml-auto text-[var(--text-tertiary)]">{relativeTime(s.closed_at || s.opened_at)}</span>
                        <Badge tone={s.status === "reconciled" ? "success" : s.status === "open" ? "primary" : diff !== null && Math.abs(diff) > 0.005 ? "warning" : "neutral"} dot>
                          {s.status === "reconciled" ? "reconciled" : s.status === "open" ? "open" : diff !== null ? `diff ${diff > 0 ? "+" : ""}${diff.toFixed(2)}` : "closed"}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ------------------------------- nfc tab -------------------------------- */}
      {tab === "nfc" && <NfcLookupPanel />}

      {/* ----------------------------- payments tab ----------------------------- */}
      {tab === "payments" && (
        <Card>
          <CardHeader title="Payments" subtitle="Every settled parking transaction" actions={<Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={loadPayments}>Refresh</Button>} />
          <div className="flex flex-wrap items-end gap-3 border-b border-[var(--card-border)] px-5 py-4">
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-[160px]" aria-label="Method filter">
              <option value="">All methods</option>
              {METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
            </Select>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-[160px]" aria-label="Date filter" />
            {payments && (
              <span className="ml-auto text-[13px] text-[var(--text-secondary)]">
                {payments.length} payment(s) · <strong className="pk-num">{fmtMoney(payments.reduce((a, p) => a + Number(p.amount), 0))}</strong>
              </span>
            )}
          </div>
          {!payments ? (
            <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : payError ? (
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-[13px] text-[var(--accent-red)]">Failed to load — {payError}</p>
              <Button size="sm" variant="outline" onClick={loadPayments}>Retry</Button>
            </div>
          ) : (
            <DataTable columns={paymentColumns} rows={payments} rowKey={(p) => p.id} empty={<EmptyState icon={<Banknote size={20} />} title="No payments" body="Settled exits appear here with printable receipts." />} />
          )}
        </Card>
      )}

      {/* ------------------------------ refunds tab ----------------------------- */}
      {tab === "refunds" && (
        <Card>
          <CardHeader title="Refunds" subtitle="Requests require authorization by another authorized user — self-approval is blocked" />
          {!refunds ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : refunds.length === 0 ? (
            <EmptyState icon={<Receipt size={20} />} title="No refund requests" body="Refunds requested from payment records appear here for authorization." />
          ) : (
            <ul className="divide-y divide-[var(--card-border)]">
              {refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-[13px]">
                  <Badge tone={r.status === "pending" ? "warning" : r.status === "approved" ? "info" : r.status === "processed" ? "success" : "danger"} dot>{r.status}</Badge>
                  <span className="pk-num font-bold">{fmtMoney(r.amount)}</span>
                  <span className="text-[var(--text-secondary)]">{r.reason}</span>
                  {r.ticket_number && <span className="pk-num text-[var(--text-tertiary)]">{r.ticket_number}</span>}
                  <span className="text-[11.5px] text-[var(--text-tertiary)]">by {r.requested_by_name || "—"} · {relativeTime(r.created_at)}</span>
                  <span className="ml-auto flex gap-2">
                    {r.status === "pending" && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => setResolveRefund({ refund: r, action: "approve" })}>Approve</Button>
                        <Button size="xs" variant="ghost" className="text-[var(--accent-red)]" onClick={() => setResolveRefund({ refund: r, action: "reject" })}>Reject</Button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button size="xs" variant="success" icon={<CheckCircle2 size={12} />} onClick={() => setResolveRefund({ refund: r, action: "process" })}>Mark processed</Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ------------------------------- dialogs ------------------------------- */}
      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} title={`Close shift ${current?.shift_code ?? ""}`} subtitle="Count the cash drawer — the server computes the expected amount and difference" size="sm"
        footer={<><Button variant="outline" size="sm" onClick={() => setCloseOpen(false)}>Cancel</Button><Button variant="success" size="sm" loading={closeBusy} onClick={closeShift}>Close shift</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <Stat label="Opening float" value={fmtMoney(current?.opening_cash ?? 0)} />
            <Stat label="Cash collected" value={fmtMoney(current?.cash_collected ?? 0)} />
          </div>
          <Field label="Counted cash in drawer" required>
            <Input type="number" min="0" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} autoFocus />
          </Field>
          <Field label="Notes (optional)"><Textarea rows={2} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} /></Field>
          {closingCash !== "" && current && (
            <p className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)]">
              Preview difference: <strong className="pk-num">{fmtMoney(Number(closingCash || 0) - (Number(current.opening_cash) + Number(current.cash_collected ?? 0)))}</strong> (final calculation includes cash movements)
            </p>
          )}
        </div>
      </Dialog>

      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `Shift ${detail.shift.shift_code}` : ""} subtitle={detail ? `${detail.shift.operator_name ?? ""} · ${fmtDateTime(detail.shift.opened_at)} → ${detail.shift.closed_at ? fmtDateTime(detail.shift.closed_at) : "open"}` : undefined} size="md"
        footer={<Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Opening" value={fmtMoney(detail.shift.opening_cash)} />
              <Stat label="Expected" value={fmtMoney(detail.shift.expected_cash ?? 0)} />
              <Stat label="Counted" value={fmtMoney(detail.shift.closing_cash ?? 0)} />
              <Stat label="Difference" value={detail.shift.cash_difference != null ? fmtMoney(detail.shift.cash_difference) : "—"} />
            </div>
            <div>
              <h4 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Payment summary</h4>
              {detail.paymentSummary.length === 0 ? <p className="text-[var(--text-tertiary)]">No payments during this shift.</p> : (
                <ul className="space-y-1">
                  {detail.paymentSummary.map((ps) => (
                    <li key={ps.payment_method} className="flex justify-between gap-3">
                      <span className="capitalize text-[var(--text-secondary)]">{ps.payment_method.replace(/_/g, " ")} ({ps.tx})</span>
                      <span className="pk-num font-medium">{fmtMoney(ps.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cash movements</h4>
              {detail.movements.length === 0 ? <p className="text-[var(--text-tertiary)]">No movements recorded.</p> : (
                <ul className="space-y-1">
                  {detail.movements.map((m) => (
                    <li key={m.id} className="flex justify-between gap-3">
                      <span className="capitalize text-[var(--text-secondary)]">{m.movement_type.replace("_", " ")}{m.reason ? ` — ${m.reason}` : ""}</span>
                      <span className="pk-num font-medium">{fmtMoney(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {receipt && <ReceiptPrintDialog payment={receipt} onClose={() => setReceipt(null)} />}

      <ConfirmDialog
        open={!!resolveRefund}
        onClose={() => setResolveRefund(null)}
        onConfirm={resolveRefundAction}
        danger={resolveRefund?.action === "reject"}
        title={`${resolveRefund?.action[0].toUpperCase()}${resolveRefund?.action.slice(1)} refund of ${resolveRefund ? fmtMoney(resolveRefund.refund.amount) : ""}?`}
        body={resolveRefund?.action === "process" ? "Marks the refund as paid out to the customer. Ensure the money has actually left the drawer." : "This decision is recorded in the audit log with your identity."}
        confirmLabel={resolveRefund?.action === "reject" ? "Reject" : resolveRefund?.action[0].toUpperCase() + (resolveRefund?.action.slice(1) ?? "")}
      />
    </div>
  );
}

function NfcLookupPanel() {
  const toast = useToast();
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [result, setResult] = useState<NfcLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }, []);

  const lookup = useCallback(
    async (raw?: string) => {
      const cardUid = normalizeCardUid(raw ?? uid);
      if (!cardUid) {
        setError("Enter a card UID or tap an NFC card.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await apiPost<NfcLookupResult>("/api/membership/parking/nfc-lookup", {
          card_uid: cardUid,
        });
        setUid(cardUid);
        setResult(res);
        if (res.found && res.member) toast.success("Card matched", res.member.full_name);
      } catch (e: any) {
        setResult(null);
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    [toast, uid]
  );

  const startScan = async () => {
    setError(null);
    if (!isWebNfcSupported()) {
      setError("Web NFC is not supported in this browser. Use Chrome on Android over HTTPS, or type the card UID.");
      return;
    }
    const reader = createWebNfcReader();
    if (!reader) {
      setError("Could not start the NFC reader on this device.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    reader.addEventListener("reading", (event) => {
      if (!abortRef.current) return;
      const cardUid = normalizeCardUid(event.serialNumber);
      if (!cardUid) return;
      stopScan();
      setUid(cardUid);
      void lookup(cardUid);
    });
    try {
      await reader.scan({ signal: controller.signal });
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message || "Could not start NFC scanning.");
      }
      setScanning(false);
    }
  };

  const member = result?.member;
  const vehicles = result?.vehicles ?? [];
  const current = result?.subscription ?? null;
  const otherSubs = (result?.subscriptions ?? []).filter((sub) => sub.id !== current?.id);
  const plate = vehicles[0]?.plate_number ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader
          icon={<Nfc size={16} />}
          title="NFC member lookup"
          subtitle="Tap a membership card or enter its UID"
        />
        <div className="space-y-4 px-5 py-5">
          <Field label="Card UID" hint="Spaces, colons and hyphens are ignored.">
            <Input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="04:A1:B2:C3:…"
              autoComplete="off"
              aria-label="NFC card UID"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="md" loading={busy} onClick={() => lookup()} icon={<ScanLine size={15} />}>
              Look up
            </Button>
            <Button
              size="md"
              variant="outline"
              loading={scanning}
              onClick={startScan}
              icon={<Nfc size={15} />}
            >
              {scanning ? "Scanning…" : "Tap NFC"}
            </Button>
            {scanning && (
              <Button size="md" variant="ghost" onClick={stopScan}>
                Stop
              </Button>
            )}
          </div>
          {error && (
            <p className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-[12.5px] text-[var(--accent-red)]">
              {error}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">
            Web NFC works in Chrome on Android over HTTPS. Desktop and iPhone users can type the
            card UID shown on the tag.
          </p>
        </div>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader
          title="Member details"
          subtitle="Plate numbers, subscription type and remaining days"
          actions={
            result?.card ? (
              <Badge tone={result.card.status === "active" ? "success" : "neutral"} dot>
                {result.card.status}
              </Badge>
            ) : undefined
          }
        />
        {!result ? (
          <EmptyState
            icon={<Nfc size={22} />}
            title="No card scanned"
            body="Tap a card or look one up by UID to see the member and their parking subscription."
          />
        ) : !result.found ? (
          <div className="space-y-3 px-5 py-6">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              {result.message || "Card not recognised"}
            </p>
            {result.card && (
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Card: <span className="pk-num">{result.card.uid}</span>
                {result.card.label ? ` - ${result.card.label}` : ""}
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setResult(null);
                setUid("");
              }}
            >
              Try another card
            </Button>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,#1d4ed8,#0e9bdb)" }}
              >
                {(member?.full_name || "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-[var(--text-primary)]">
                  {member?.full_name}
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)]">
                  {member?.customer_id || `#${member?.id}`}
                  {member?.phone ? ` - ${member.phone}` : ""}
                </p>
              </div>
              <Badge
                tone={
                  member?.status === "active"
                    ? "success"
                    : member?.status === "suspended"
                      ? "warning"
                      : "neutral"
                }
                dot
                className="ml-auto"
              >
                {member?.status}
              </Badge>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Vehicle plates
              </p>
              {vehicles.length === 0 ? (
                <p className="text-[13px] text-[var(--text-tertiary)]">
                  No vehicle linked to this member.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {vehicles.map((vehicle) => (
                    <Badge
                      key={vehicle.id}
                      tone={vehicle.is_blacklisted ? "danger" : "neutral"}
                      className="pk-num"
                    >
                      {vehicle.plate_number}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div
              className={
                current
                  ? "rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-4"
                  : "rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-4"
              }
            >
              {current ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Subscription
                      </p>
                      <p className="mt-1 text-[15px] font-bold text-[var(--text-primary)]">
                        {current.plan_name || current.plan_type || "Parking subscription"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                        Type:{" "}
                        <span className="font-medium">
                          {current.plan_type || current.plan_category || "parking"}
                        </span>
                        {current.plan_category ? ` - ${current.plan_category}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="pk-num text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                        {result.remaining_days ?? current.days_remaining}
                      </p>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        days left
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-3">
                    <div className="rounded-lg bg-[var(--card-bg)] px-3 py-2">
                      <dt className="text-[10px] uppercase text-[var(--text-tertiary)]">Valid from</dt>
                      <dd className="mt-0.5 font-medium">{fmtDate(current.start_date)}</dd>
                    </div>
                    <div className="rounded-lg bg-[var(--card-bg)] px-3 py-2">
                      <dt className="text-[10px] uppercase text-[var(--text-tertiary)]">Valid until</dt>
                      <dd className="mt-0.5 font-medium">{fmtDate(current.end_date)}</dd>
                    </div>
                    <div className="rounded-lg bg-[var(--card-bg)] px-3 py-2">
                      <dt className="text-[10px] uppercase text-[var(--text-tertiary)]">Status</dt>
                      <dd className="mt-0.5 font-medium capitalize">{current.status}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div>
                  <p className="text-[13px] font-bold text-[var(--text-primary)]">
                    No active subscription covering today
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    The member can still be looked up, but parking is charged at the normal tariff.
                  </p>
                </div>
              )}
            </div>

            {otherSubs.length > 0 && (
              <details className="rounded-xl border border-[var(--card-border)]">
                <summary className="cursor-pointer px-4 py-3 text-[12.5px] font-semibold text-[var(--text-primary)]">
                  Other subscriptions ({otherSubs.length})
                </summary>
                <ul className="divide-y divide-[var(--card-border)]">
                  {otherSubs.map((sub) => (
                    <li key={sub.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px]">
                      <span className="font-medium">{sub.plan_name || sub.plan_type || "Parking plan"}</span>
                      <span className="text-[var(--text-tertiary)]">
                        {fmtDate(sub.start_date)} → {fmtDate(sub.end_date)}
                      </span>
                      <Badge tone={sub.is_current ? "success" : "neutral"} className="ml-auto">
                        {sub.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setUid("");
                }}
              >
                Clear
              </Button>
              {plate && (
                <Button
                  size="sm"
                  icon={<Banknote size={14} />}
                  onClick={() =>
                    router.push(
                      `/dashboard/membership/parking/exit?mode=cashier&q=${encodeURIComponent(plate)}`
                    )
                  }
                >
                  Open cashier exit
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] px-3.5 py-3">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="pk-num mt-1 text-[14px] font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function ReceiptPrintDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  return (
    <>
      <div className="pk-print-area hidden">
        <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>PARKING RECEIPT (REPRINT)</strong>
          <div style={{ fontSize: 11 }}>{payment.receipt_number}</div>
        </div>
        <table style={{ width: "100%", fontSize: 12 }}>
          <tbody>
            <tr><td>Receipt</td><td style={{ textAlign: "right", fontWeight: 700 }}>{payment.receipt_number}</td></tr>
            <tr><td>Ticket</td><td style={{ textAlign: "right" }}>{payment.ticket_number || "—"}</td></tr>
            <tr><td>Plate</td><td style={{ textAlign: "right" }}>{payment.plate_number || "—"}</td></tr>
            <tr><td>Method</td><td style={{ textAlign: "right" }}>{payment.payment_method}</td></tr>
            <tr><td>Date</td><td style={{ textAlign: "right" }}>{fmtDateTime(payment.payment_date)}</td></tr>
          </tbody>
        </table>
        <table style={{ width: "100%", fontSize: 14, marginTop: 10, borderTop: "2px solid #000", paddingTop: 8, fontWeight: 700 }}>
          <tbody>
            <tr><td>TOTAL</td><td style={{ textAlign: "right" }}>{fmtMoney(payment.amount, payment.currency)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="pk-overlay fixed inset-0 z-[70] flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="pk-dialog w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-lg)]">
          <div className="border-b border-[var(--card-border)] px-5 py-4 text-center">
            <h2 className="text-base font-bold">Receipt {payment.receipt_number}</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">{payment.plate_number || payment.ticket_number} · {payment.payment_method}</p>
          </div>
          <div className="px-5 py-4 text-center">
            <p className="pk-num text-3xl font-bold text-[var(--text-primary)]">{fmtMoney(payment.amount, payment.currency)}</p>
            <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">{fmtDateTime(payment.payment_date)}</p>
          </div>
          <div className="flex gap-2 border-t border-[var(--card-border)] px-5 py-3.5">
            <Button variant="outline" size="md" className="flex-1" icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button>
            <Button size="md" className="flex-1" onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </>
  );
}
