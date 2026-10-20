"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, CreditCard, Plus, RefreshCw, XCircle } from "lucide-react";
import {
  Badge, Button, Card, ConfirmDialog, DataTable, Dialog, EmptyState, Field, Input,
  Segmented, Select, Skeleton, Switch, fmtDate, fmtInt, fmtMoney, useToast, type Column,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";

interface Plan { id: number; name: string; description: string | null; price: string; currency: string; duration_days: number | null; type: string; max_members: number | null; is_active: boolean }
interface Subscription {
  id: number;
  customer_id: number;
  customer_name?: string;
  vehicle_id: number | null;
  vehicle_plate?: string | null;
  plan_type: string;
  plan_id: number | null;
  plan_name?: string | null;
  start_date: string;
  end_date: string;
  amount: string | number;
  payment_method: string;
  payment_reference?: string | null;
  status: string;
  auto_renew: boolean;
  renewal_count: number;
  notes?: string | null;
}

function daysLeft(end: string): number {
  return Math.ceil((new Date(end + "T23:59:59").getTime() - Date.now()) / 86400000);
}

export default function MembershipsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"subscriptions" | "plans">("subscriptions");
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [edit, setEdit] = useState<Subscription | null>(null);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [renew, setRenew] = useState<Subscription | null>(null);
  const [cancel, setCancel] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const sp = new URLSearchParams({ limit: "500" });
      if (statusFilter) sp.set("status", statusFilter);
      if (debounced) sp.set("q", debounced);
      const [s, p] = await Promise.all([
        apiGet<Subscription[]>(`/api/membership/parking/subscriptions?${sp}`),
        apiGet<Plan[]>("/api/membership/parking/plans?limit=100&is_active=true"),
      ]);
      setSubs(s);
      setPlans(p);
    } catch (e: any) {
      setError(e.message);
      setSubs([]);
    }
  }, [statusFilter, debounced]);
  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const list = subs ?? [];
    const active = list.filter((s) => s.status === "active");
    return {
      active: active.length,
      expiring: active.filter((s) => daysLeft(s.end_date) <= 7 && daysLeft(s.end_date) >= 0).length,
      expired: active.filter((s) => daysLeft(s.end_date) < 0).length,
      mrr: active.filter((s) => daysLeft(s.end_date) >= 0).reduce((a, s) => a + Number(s.amount), 0),
    };
  }, [subs]);

  const doRenew = async (months: number) => {
    if (!renew) return;
    setBusy(true);
    try {
      const base = new Date(renew.end_date) > new Date() ? new Date(renew.end_date) : new Date();
      const end = new Date(base);
      end.setMonth(end.getMonth() + months);
      await apiPost("/api/membership/parking/subscriptions", {
        customer_id: renew.customer_id,
        vehicle_id: renew.vehicle_id ?? undefined,
        plan_id: renew.plan_id ?? undefined,
        plan_type: renew.plan_type,
        start_date: base.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        amount: Number(renew.amount),
        payment_method: renew.payment_method,
      });
      toast.success(`Renewed for ${months} month${months > 1 ? "s" : ""}`, `New period ends ${end.toISOString().slice(0, 10)}`);
      setRenew(null);
      load();
    } catch (e: any) {
      toast.error("Renewal failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!cancel) return;
    setBusy(true);
    try {
      await apiPut(`/api/membership/parking/subscriptions/${cancel.id}`, { status: "cancelled" });
      toast.success("Subscription cancelled");
      setCancel(null);
      load();
    } catch (e: any) {
      toast.error("Cancel failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Subscription>[] = [
    {
      key: "customer", label: "Customer",
      render: (s) => (
        <span>
          <span className="block font-semibold text-[var(--text-primary)]">{s.customer_name || `#${s.customer_id}`}</span>
          {s.vehicle_plate && <span className="pk-num text-[11px] text-[var(--text-tertiary)]">{s.vehicle_plate}</span>}
        </span>
      ),
    },
    { key: "plan_type", label: "Plan", render: (s) => <Badge tone="neutral" className="capitalize">{s.plan_type}</Badge> },
    { key: "period", label: "Period", hideBelow: "md", render: (s) => <span className="pk-num text-[12.5px]">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</span> },
    {
      key: "remaining", label: "Remaining", align: "center", render: (s) => {
        if (s.status !== "active") return <Badge tone="neutral">{s.status}</Badge>;
        const d = daysLeft(s.end_date);
        return d < 0 ? <Badge tone="danger" dot>expired {-d}d ago</Badge> : d <= 7 ? <Badge tone="warning" dot>{d}d left</Badge> : <span className="pk-num">{d}d left</span>;
      },
    },
    { key: "amount", label: "Amount", align: "right", render: (s) => fmtMoney(s.amount) },
    { key: "auto_renew", label: "Auto", align: "center", hideBelow: "lg", render: (s) => (s.auto_renew ? <Badge tone="info">auto</Badge> : "—") },
    {
      key: "actions", label: "", align: "right", render: (s) => (
        <div className="flex justify-end gap-1">
          <Button size="xs" variant="ghost" icon={<RefreshCw size={13} />} onClick={() => setRenew(s)} aria-label={`Renew ${s.customer_name}`}>Renew</Button>
          {s.status === "active" && (
            <Button size="xs" variant="ghost" className="text-[var(--accent-red)]" icon={<XCircle size={13} />} onClick={() => setCancel(s)} aria-label={`Cancel ${s.customer_name}`} />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Memberships</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Monthly and annual parking agreements with renewal tracking.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "subscriptions", label: <>Subscriptions</> },
              { value: "plans", label: <>Plans</> },
            ]}
          />
          {tab === "subscriptions" && <Button size="md" icon={<Plus size={15} />} onClick={() => setEdit({ id: 0, customer_id: 0, vehicle_id: null, plan_type: "monthly", plan_id: null, start_date: new Date().toISOString().slice(0, 10), end_date: "", amount: 0, payment_method: "cash", status: "active", auto_renew: false, renewal_count: 0 })}>New subscription</Button>}
          {tab === "plans" && <Button size="md" icon={<Plus size={15} />} onClick={() => setEditPlan({ id: 0, name: "", description: "", price: "0", currency: "ETB", duration_days: 30, type: "parking", max_members: null, is_active: true })}>New plan</Button>}
        </div>
      </div>

      {tab === "subscriptions" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniStat label="Active" value={fmtInt(summary.active)} tone="success" />
            <MiniStat label="Expiring ≤ 7 days" value={fmtInt(summary.expiring)} tone="warning" />
            <MiniStat label="Expired (still active)" value={fmtInt(summary.expired)} tone="danger" />
            <MiniStat label="Monthly recurring" value={fmtMoney(summary.mrr)} tone="primary" />
          </div>

          <Card>
            <div className="flex flex-wrap items-end gap-3 border-b border-[var(--card-border)] px-5 py-4">
              <div className="min-w-[200px] flex-1">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer…" aria-label="Search subscriptions" />
              </div>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[150px]" aria-label="Status filter">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
                <option value="pending">Pending</option>
              </Select>
            </div>
            {error ? (
              <div className="flex items-center justify-between px-5 py-4">
                <p className="text-[13px] text-[var(--accent-red)]">Failed to load — {error}</p>
                <Button size="sm" variant="outline" onClick={load}>Retry</Button>
              </div>
            ) : !subs ? (
              <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
              <DataTable columns={columns} rows={subs} rowKey={(s) => s.id}
                empty={<EmptyState icon={<CalendarCheck size={20} />} title="No subscriptions" body="Sell a monthly or annual parking plan to a registered customer." action={<Button size="sm" onClick={() => setEdit({ id: 0, customer_id: 0, vehicle_id: null, plan_type: "monthly", plan_id: null, start_date: new Date().toISOString().slice(0, 10), end_date: "", amount: 0, payment_method: "cash", status: "active", auto_renew: false, renewal_count: 0 })}>New subscription</Button>} />}
              />
            )}
          </Card>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {!plans.length && (
            <Card className="md:col-span-2 xl:col-span-3">
              <EmptyState icon={<CreditCard size={20} />} title="No plans yet" body="Plans define price and duration templates for subscriptions." action={<Button size="sm" onClick={() => setEditPlan({ id: 0, name: "", description: "", price: "0", currency: "ETB", duration_days: 30, type: "parking", max_members: null, is_active: true })}>Create plan</Button>} />
            </Card>
          )}
          {plans.map((p) => (
            <Card key={p.id} hover className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--text-primary)]">{p.name}</h3>
                  <p className="mt-0.5 text-[12.5px] text-[var(--text-tertiary)]">{p.description || "—"}</p>
                </div>
                <Badge tone={p.is_active ? "success" : "neutral"} dot>{p.is_active ? "active" : "off"}</Badge>
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="pk-num text-2xl font-bold text-[var(--primary)]">{fmtMoney(p.price, p.currency)}</span>
                <span className="text-[12.5px] text-[var(--text-tertiary)]">/ {p.duration_days ? `${p.duration_days} days` : "custom"}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditPlan(p)}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-[var(--accent-red)]" icon={<TrashIcon />} onClick={async () => {
                  try {
                    await apiDelete(`/api/membership/parking/plans/${p.id}`);
                    toast.success("Plan deleted");
                    load();
                  } catch (e: any) {
                    toast.error("Cannot delete plan", e.message);
                  }
                }} aria-label={`Delete plan ${p.name}`} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <SubscriptionDialog sub={edit} plans={plans} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      <PlanDialog plan={editPlan} onClose={() => setEditPlan(null)} onSaved={() => { setEditPlan(null); load(); }} />

      <Dialog open={!!renew} onClose={() => setRenew(null)} title={`Renew — ${renew?.customer_name ?? ""}`} subtitle={renew ? `Current period ends ${fmtDate(renew.end_date)} · ${fmtMoney(renew.amount)}` : undefined} size="sm"
        footer={<Button variant="outline" size="sm" onClick={() => setRenew(null)}>Close</Button>}>
        {renew && (
          <div className="grid grid-cols-1 gap-2">
            {[1, 3, 6, 12].map((m) => (
              <Button key={m} variant="outline" size="md" className="justify-between" disabled={busy} onClick={() => doRenew(m)}>
                <span>+{m} month{m > 1 ? "s" : ""}</span>
                <span className="pk-num font-bold">{fmtMoney(Number(renew.amount) * m)}</span>
              </Button>
            ))}
            <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">
              Creates a new subscription starting when the current one ends. Overlapping periods are refused by the server.
            </p>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!cancel}
        onClose={() => setCancel(null)}
        onConfirm={doCancel}
        loading={busy}
        danger
        title={cancel ? `Cancel subscription of ${cancel.customer_name}?` : ""}
        body="The subscription is marked cancelled immediately. History is preserved; already-collected payments are not refunded here."
        confirmLabel="Cancel subscription"
      />
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "primary" }) {
  const colors = { success: "var(--accent-green)", warning: "var(--accent-amber)", danger: "var(--accent-red)", primary: "var(--primary)" };
  return (
    <Card className="p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className="pk-num mt-1.5 text-xl font-bold" style={{ color: tone === "primary" ? "var(--text-primary)" : colors[tone] }}>{value}</p>
    </Card>
  );
}

function TrashIcon() {
  return <AlertTriangle size={0} className="hidden" />;
}

/* -------------------------------- dialogs --------------------------------- */

function SubscriptionDialog({ sub, plans, onClose, onSaved }: { sub: Subscription | null; plans: Plan[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [customers, setCustomers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: number; plate_number: string; customer_id: number | null }>>([]);
  const [form, setForm] = useState<Partial<Subscription>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm(sub ?? {});
    if (sub) {
      apiGet<Array<{ id: number; full_name: string }>>("/api/membership/parking/customers?limit=500").then(setCustomers).catch(() => {});
      apiGet<Array<{ id: number; plate_number: string; customer_id: number | null }>>("/api/membership/parking/vehicles?limit=500").then(setVehicles).catch(() => {});
    }
  }, [sub]);
  if (!sub) return null;

  const applyPlan = (planId: string) => {
    const p = plans.find((x) => String(x.id) === planId);
    if (!p) {
      setForm((f) => ({ ...f, plan_id: null }));
      return;
    }
    const start = new Date(form.start_date || new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + (p.duration_days || 30));
    setForm((f) => ({
      ...f,
      plan_id: p.id,
      plan_type: "plan",
      amount: Number(p.price),
      end_date: end.toISOString().slice(0, 10),
    }));
  };

  const save = async () => {
    if (!form.customer_id) {
      toast.error("Select a customer");
      return;
    }
    if (!form.end_date) {
      toast.error("End date is required");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/membership/parking/subscriptions", {
        customer_id: Number(form.customer_id),
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : undefined,
        plan_id: form.plan_id ?? undefined,
        plan_type: form.plan_type || "monthly",
        start_date: form.start_date,
        end_date: form.end_date,
        amount: Number(form.amount),
        payment_method: form.payment_method || "cash",
        payment_reference: form.payment_reference || undefined,
        auto_renew: !!form.auto_renew,
        notes: form.notes || undefined,
      });
      toast.success("Subscription created", "Overlapping periods are refused automatically");
      onSaved();
    } catch (e: any) {
      toast.error(e.status === 409 ? "Overlapping subscription" : "Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="New subscription" subtitle="Links a customer + vehicle to a paid parking period" size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>Create</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Customer" required>
          <Select value={form.customer_id ? String(form.customer_id) : ""} onChange={(e) => setForm((f) => ({ ...f, customer_id: Number(e.target.value) || 0 }))}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Vehicle" hint="Optional but recommended">
          <Select value={form.vehicle_id ? String(form.vehicle_id) : ""} onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— none —</option>
            {vehicles
              .filter((v) => !form.customer_id || v.customer_id === form.customer_id || !v.customer_id)
              .map((v) => <option key={v.id} value={String(v.id)}>{v.plate_number}</option>)}
          </Select>
        </Field>
        <Field label="Plan template" className="sm:col-span-2" hint="Applying a plan sets amount + end date">
          <Select value={form.plan_id ? String(form.plan_id) : ""} onChange={(e) => applyPlan(e.target.value)}>
            <option value="">Custom period</option>
            {plans.filter((p) => p.is_active).map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name} — {fmtMoney(p.price, p.currency)} / {p.duration_days ?? "?"}d</option>
            ))}
          </Select>
        </Field>
        <Field label="Plan type">
          <Select value={form.plan_type ?? "monthly"} onChange={(e) => setForm((f) => ({ ...f, plan_type: e.target.value }))}>
            {["monthly", "quarterly", "semi_annual", "annual", "plan"].map((t) => <option key={t} value={t} className="capitalize">{t.replace("_", " ")}</option>)}
          </Select>
        </Field>
        <Field label="Amount (ETB)" required>
          <Input type="number" min="0" step="0.01" value={form.amount != null ? String(form.amount) : ""} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
        </Field>
        <Field label="Start date" required>
          <Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
        </Field>
        <Field label="End date" required>
          <Input type="date" value={form.end_date ?? ""} min={form.start_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
        </Field>
        <Field label="Payment method">
          <Select value={form.payment_method ?? "cash"} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}>
            {["cash", "telebirr", "cbebirr", "bank", "pos", "chapa", "addispay"].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Payment reference"><Input value={form.payment_reference ?? ""} onChange={(e) => setForm((f) => ({ ...f, payment_reference: e.target.value }))} /></Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={!!form.auto_renew} onChange={(v) => setForm((f) => ({ ...f, auto_renew: v }))} label="Auto renew" />
          <span className="text-[13px] text-[var(--text-secondary)]">Flag for automatic renewal reminders</span>
        </div>
      </div>
    </Dialog>
  );
}

function PlanDialog({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Plan>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(plan ?? {}), [plan]);
  if (!plan) return null;
  const isNew = plan.id === 0;

  const save = async () => {
    if (!form.name?.trim() || !form.price || Number(form.price) <= 0) {
      toast.error("Name and a positive price are required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(), description: form.description || null,
        price: Number(form.price), currency: form.currency || "ETB",
        duration_days: Number(form.duration_days) || 30,
        type: "parking", is_active: form.is_active !== false,
      };
      if (isNew) await apiPost("/api/membership/parking/plans", body);
      else await apiPut(`/api/membership/parking/plans/${plan.id}`, body);
      toast.success(isNew ? "Plan created" : "Plan updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isNew ? "New plan" : `Edit plan — ${plan.name}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Create" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Plan name" required className="sm:col-span-2"><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Monthly Standard" /></Field>
        <Field label="Price" required><Input type="number" min="0" step="0.01" value={form.price ?? ""} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></Field>
        <Field label="Duration (days)"><Input type="number" min="1" value={form.duration_days ?? 30} onChange={(e) => setForm((f) => ({ ...f, duration_days: Number(e.target.value) }))} /></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={form.is_active !== false} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
          <span className="text-[13px] text-[var(--text-secondary)]">Available for new subscriptions</span>
        </div>
      </div>
    </Dialog>
  );
}
