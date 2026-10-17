"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, DollarSign, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, Dialog, EmptyState, Field, Input,
  Select, Skeleton, Switch, cn, fmtMoney, useToast, type Column,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";

const VEHICLE_TYPES = ["car", "suv", "truck", "bus", "motorcycle", "bicycle", "other", "all"];
const RATE_TYPES = ["hourly", "daily", "overnight", "flat", "monthly", "annual"];

interface Rate {
  id: number;
  name: string;
  vehicle_type: string;
  rate_type: string;
  base_rate: string;
  per_hour_rate: string | null;
  per_day_rate: string | null;
  overnight_rate: string | null;
  overnight_start_hour: number | null;
  overnight_end_hour: number | null;
  billing_increment_minutes: number | null;
  grace_period_minutes: number | null;
  min_charge: string | null;
  max_daily_charge: string | null;
  currency: string;
  is_active: boolean;
  is_default: boolean;
}

interface PreviewResponse {
  pricing: {
    fee: { durationMinutes: number; units: number; unitLabel: string; amount: number; breakdown: Array<{ label: string; amount: number }>; note?: string };
    grossAmount: number;
    amountDue: number;
    currency: string;
    tariffName: string | null;
  };
}

const SAMPLE_MINUTES = [15, 30, 60, 90, 180, 480, 1440, 2880];

export default function TariffsPage() {
  const toast = useToast();
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Rate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Rate | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRates(await apiGet<Rate[]>("/api/membership/parking/rates?limit=200"));
    } catch (e: any) {
      setError(e.message);
      setRates([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const setDefault = async (rate: Rate) => {
    try {
      await apiPut(`/api/membership/parking/rates/${rate.id}`, { is_default: true, is_active: true });
      toast.success(`“${rate.name}” is now the default tariff`);
      load();
    } catch (e: any) {
      toast.error("Could not set default", e.message);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await apiDelete(`/api/membership/parking/rates/${confirmDelete.id}`);
      toast.success("Tariff deleted");
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      toast.error("Cannot delete tariff", e.message);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Rate>[] = [
    {
      key: "name", label: "Tariff",
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-[var(--text-primary)]">{r.name}</span>
          {r.is_default && <Badge tone="primary"><Star size={10} /> default</Badge>}
        </span>
      ),
    },
    { key: "vehicle_type", label: "Vehicles", render: (r) => <Badge tone="neutral">{r.vehicle_type}</Badge> },
    { key: "rate_type", label: "Model", render: (r) => <span className="capitalize">{r.rate_type}</span> },
    {
      key: "price", label: "Price", render: (r) => (
        <span className="pk-num">
          {r.rate_type === "flat" || r.rate_type === "monthly" || r.rate_type === "annual"
            ? `${fmtMoney(r.base_rate, r.currency)} flat`
            : `${fmtMoney(r.base_rate, r.currency)} + ${fmtMoney(r.per_hour_rate, r.currency)}/hr`}
        </span>
      ),
    },
    { key: "grace", label: "Grace", align: "center", hideBelow: "md", render: (r) => `${r.grace_period_minutes ?? 0} min` },
    { key: "increment", label: "Increment", align: "center", hideBelow: "lg", render: (r) => `${r.billing_increment_minutes ?? 60} min` },
    { key: "min", label: "Min charge", align: "right", hideBelow: "lg", render: (r) => (Number(r.min_charge) > 0 ? fmtMoney(r.min_charge, r.currency) : "—") },
    { key: "cap", label: "Daily cap", align: "right", hideBelow: "lg", render: (r) => (r.max_daily_charge && Number(r.max_daily_charge) > 0 ? fmtMoney(r.max_daily_charge, r.currency) : "—") },
    {
      key: "is_active", label: "Active", align: "center",
      render: (r) => <Badge tone={r.is_active ? "success" : "neutral"} dot>{r.is_active ? "yes" : "no"}</Badge>,
    },
    {
      key: "actions", label: "", align: "right", render: (r) => (
        <div className="flex justify-end gap-1">
          {!r.is_default && (
            <Button size="xs" variant="ghost" icon={<Star size={13} />} onClick={() => setDefault(r)} title="Make default" aria-label={`Make ${r.name} default`} />
          )}
          <Button size="xs" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEdit(r)} aria-label={`Edit ${r.name}`} />
          <Button size="xs" variant="ghost" className="text-[var(--accent-red)]" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete(r)} aria-label={`Delete ${r.name}`} />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Tariffs & Pricing</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
            One authoritative pricing engine — exits, previews and reports all read these rules.
          </p>
        </div>
        <Button size="md" icon={<Plus size={15} />} onClick={() => setEdit(newRateTemplate())}>New tariff</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Configured tariffs" subtitle="The matching tariff for a vehicle type is applied at exit; the default covers everything else" />
          {error ? (
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-[13px] text-[var(--accent-red)]">Failed to load tariffs — {error}</p>
              <Button size="sm" variant="outline" onClick={load}>Retry</Button>
            </div>
          ) : !rates ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable
              columns={columns}
              rows={rates}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  icon={<DollarSign size={20} />}
                  title="No tariffs configured"
                  body="Without a tariff the fallback price is 30 ETB per started 30 minutes. Create a tariff to control pricing."
                  action={<Button size="sm" onClick={() => setEdit(newRateTemplate())}>Create the first tariff</Button>}
                />
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader icon={<Calculator size={16} />} title="Fee calculator" subtitle="Authoritative preview via the same engine used at exit" />
          <CalculatorPanel />
        </Card>
      </div>

      <RateDialog rate={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title={confirmDelete ? `Delete tariff “${confirmDelete.name}”?` : ""}
        body="Completed sessions keep their frozen fee snapshot, so history stays correct. Future exits fall back to other active tariffs or the built-in fallback."
        confirmLabel="Delete tariff"
      />
    </div>
  );
}

function newRateTemplate(): Rate {
  return {
    id: 0, name: "", vehicle_type: "car", rate_type: "hourly",
    base_rate: "0", per_hour_rate: "30", per_day_rate: "0", overnight_rate: "0",
    overnight_start_hour: 20, overnight_end_hour: 6,
    billing_increment_minutes: 30, grace_period_minutes: 15,
    min_charge: "0", max_daily_charge: "", currency: "ETB",
    is_active: true, is_default: false,
  };
}

/* ----------------------------- calculator panel --------------------------- */

function CalculatorPanel() {
  const [vehicleType, setVehicleType] = useState("car");
  const [minutes, setMinutes] = useState(120);
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const useDates = entry !== "" && exit !== "";

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ vehicle_type: vehicleType });
      if (useDates) {
        sp.set("entry", new Date(entry).toISOString());
        sp.set("exit", new Date(exit).toISOString());
      } else {
        sp.set("minutes", String(minutes));
      }
      setPreview(await apiGet<PreviewResponse>(`/api/membership/parking/fee-preview?${sp.toString()}`));
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [vehicleType, minutes, entry, exit, useDates]);

  useEffect(() => {
    const t = setTimeout(fetchPreview, 250);
    return () => clearTimeout(t);
  }, [fetchPreview]);

  const p = preview?.pricing;

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle type">
          <Select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            {VEHICLE_TYPES.filter((v) => v !== "all").map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}
          </Select>
        </Field>
        <Field label="Duration (minutes)">
          <Input type="number" min="0" value={minutes} disabled={useDates} onChange={(e) => setMinutes(Math.max(0, Number(e.target.value)))} />
        </Field>
      </div>
      <Field label="Or exact times" hint="Optional — overrides duration">
        <div className="grid grid-cols-2 gap-2">
          <Input type="datetime-local" value={entry} onChange={(e) => setEntry(e.target.value)} aria-label="Entry time" />
          <Input type="datetime-local" value={exit} onChange={(e) => setExit(e.target.value)} aria-label="Exit time" />
        </div>
      </Field>

      <div className="flex flex-wrap gap-1.5">
        {SAMPLE_MINUTES.map((m) => (
          <button
            key={m}
            onClick={() => { setEntry(""); setExit(""); setMinutes(m); }}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
              !useDates && minutes === m
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            )}
          >
            {m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : `${m / 1440}d`}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-sunken)] px-4 py-4">
        {loading && !p ? (
          <div className="space-y-2"><div className="pk-skeleton h-4" /><div className="pk-skeleton h-6 w-28" /></div>
        ) : p ? (
          <>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {p.tariffName ?? "Fallback pricing (30 ETB / 30 min)"}
            </p>
            <ul className="space-y-1">
              {p.fee.breakdown.map((b, i) => (
                <li key={i} className="flex justify-between gap-3 text-[12.5px] text-[var(--text-secondary)]">
                  <span>{b.label}</span>
                  <span className="pk-num">{b.amount === 0 ? "—" : fmtMoney(b.amount, p.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--card-border)] pt-2.5">
              <span className="text-[13px] font-bold">Total due</span>
              <span className="pk-num text-lg font-bold text-[var(--primary)]">{fmtMoney(p.amountDue, p.currency)}</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              {p.fee.durationMinutes} min stay · billed in {p.fee.units} × {p.fee.unitLabel}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-[var(--text-tertiary)]">Choose a duration to preview the fee.</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- rate dialog ----------------------------- */

function RateDialog({ rate, onClose, onSaved }: { rate: Rate | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Rate>>({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setForm(rate ?? {}), [rate]);
  if (!rate) return null;
  const isNew = rate.id === 0;

  const set = (k: keyof Rate, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!String(form.name ?? "").trim()) e.name = "Name is required";
    const base = Number(form.base_rate ?? 0);
    if (!isFinite(base) || base < 0) e.base_rate = "Must be ≥ 0";
    if (form.rate_type !== "flat" && form.rate_type !== "monthly" && form.rate_type !== "annual") {
      const ph = Number(form.per_hour_rate ?? 0);
      if (!isFinite(ph) || ph < 0) e.per_hour_rate = "Must be ≥ 0";
      if (ph === 0 && base === 0) e.per_hour_rate = "Hourly or base rate must be greater than 0";
    }
    const inc = Number(form.billing_increment_minutes ?? 60);
    if (!isFinite(inc) || inc < 1) e.billing_increment_minutes = "At least 1 minute";
    const grace = Number(form.grace_period_minutes ?? 0);
    if (!isFinite(grace) || grace < 0) e.grace_period_minutes = "Must be ≥ 0";
    const osh = Number(form.overnight_start_hour ?? 20);
    const oeh = Number(form.overnight_end_hour ?? 6);
    if (osh < 0 || osh > 23 || oeh < 0 || oeh > 23) e.overnight_start_hour = "Hours must be 0–23";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const body = {
        name: String(form.name).trim(),
        vehicle_type: form.vehicle_type || "car",
        rate_type: form.rate_type || "hourly",
        base_rate: Number(form.base_rate ?? 0),
        per_hour_rate: Number(form.per_hour_rate ?? 0),
        per_day_rate: Number(form.per_day_rate ?? 0),
        overnight_rate: Number(form.overnight_rate ?? 0),
        overnight_start_hour: Number(form.overnight_start_hour ?? 20),
        overnight_end_hour: Number(form.overnight_end_hour ?? 6),
        billing_increment_minutes: Number(form.billing_increment_minutes ?? 30),
        grace_period_minutes: Number(form.grace_period_minutes ?? 0),
        min_charge: Number(form.min_charge ?? 0),
        max_daily_charge: form.max_daily_charge === "" || form.max_daily_charge == null ? null : Number(form.max_daily_charge),
        currency: form.currency || "ETB",
        is_active: form.is_active !== false,
        is_default: !!form.is_default,
      };
      if (isNew) await apiPost("/api/membership/parking/rates", body);
      else await apiPut(`/api/membership/parking/rates/${rate.id}`, body);
      toast.success(isNew ? "Tariff created" : "Tariff updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const numeric = (key: keyof Rate, label: string, opts?: { step?: string; hint?: string; prefix?: string }) => (
    <Field label={label} hint={opts?.hint} error={errors[key as string]}>
      <Input
        type="number"
        min="0"
        step={opts?.step ?? "0.01"}
        value={(form[key] as any) ?? ""}
        onChange={(e) => set(key, e.target.value)}
        invalid={!!errors[key as string]}
      />
    </Field>
  );

  const perDuration = form.rate_type === "daily";

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? "New tariff" : `Edit tariff — ${rate.name}`}
      subtitle="Rules are validated server-side; completed sessions freeze their fee snapshot"
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} onClick={save}>{isNew ? "Create tariff" : "Save changes"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tariff name" required error={errors.name}>
          <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Standard Hourly" invalid={!!errors.name} />
        </Field>
        <Field label="Vehicle type" hint="‘all’ matches every vehicle">
          <Select value={form.vehicle_type ?? "car"} onChange={(e) => set("vehicle_type", e.target.value)}>
            {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v === "all" ? "All vehicles" : v}</option>)}
          </Select>
        </Field>
        <Field label="Pricing model">
          <Select value={form.rate_type ?? "hourly"} onChange={(e) => set("rate_type", e.target.value)}>
            {RATE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </Select>
        </Field>
        {numeric("base_rate", form.rate_type === "flat" || form.rate_type === "monthly" || form.rate_type === "annual" ? "Flat amount" : "Base fee", { hint: "Added once per stay" })}

        {form.rate_type !== "flat" && form.rate_type !== "monthly" && form.rate_type !== "annual" && (
          <>
            {numeric("per_hour_rate", perDuration ? "Per-hour rate" : "Per increment rate", { hint: "Charged per billing increment" })}
            {numeric("per_day_rate", "Per-day rate (daily model)", { hint: "Used by the daily pricing model" })}
          </>
        )}

        {numeric("grace_period_minutes", "Grace period (minutes)", { hint: "Stays shorter than this are free", step: "1" })}
        {numeric("billing_increment_minutes", "Billing increment (minutes)", { hint: "30 = per started 30 min", step: "1" })}
        {numeric("min_charge", "Minimum charge", { hint: "Floor for any non-zero bill" })}
        {numeric("max_daily_charge", "Max daily charge", { hint: "Per-day cap, empty = unlimited" })}

        {form.rate_type === "overnight" && (
          <>
            {numeric("overnight_rate", "Overnight flat rate")}
            <Field label="Overnight window" error={errors.overnight_start_hour}>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" max="23" value={form.overnight_start_hour ?? 20} onChange={(e) => set("overnight_start_hour", Number(e.target.value))} aria-label="Overnight start hour" />
                <span className="text-[var(--text-tertiary)]">→</span>
                <Input type="number" min="0" max="23" value={form.overnight_end_hour ?? 6} onChange={(e) => set("overnight_end_hour", Number(e.target.value))} aria-label="Overnight end hour" />
              </div>
            </Field>
          </>
        )}

        <Field label="Currency">
          <Select value={form.currency ?? "ETB"} onChange={(e) => set("currency", e.target.value)}>
            <option value="ETB">ETB — Ethiopian Birr</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
          </Select>
        </Field>

        <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
          <label className="flex items-center gap-3">
            <Switch checked={form.is_active !== false} onChange={(v) => set("is_active", v)} label="Active" />
            <span className="text-[13px] text-[var(--text-secondary)]">Active</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch checked={!!form.is_default} onChange={(v) => set("is_default", v)} label="Default tariff" />
            <span className="text-[13px] text-[var(--text-secondary)]">Default tariff <span className="text-[var(--text-tertiary)]">(used when no vehicle-type match)</span></span>
          </label>
        </div>
      </div>
    </Dialog>
  );
}
