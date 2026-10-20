"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Car, Clock, Download, Eye, Nfc, Phone, Plus, UserPlus, Users } from "lucide-react";
import {
  Badge, Button, Card, ConfirmDialog, DataTable, Dialog, EmptyState, Field, Input,
  Select, Skeleton, useToast, fmtDate, fmtMoney, relativeTime, type Column,
} from "@/lib/ui";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/client";
import { createWebNfcReader, isWebNfcSupported } from "@/lib/web-nfc";
import { normalizeCardUid } from "@/lib/card-uid";

interface Customer {
  id: number;
  customer_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  id_number?: string | null;
  address?: string | null;
  status: string;
  start_date: string;
  end_date: string;
  notes?: string | null;
}
interface Vehicle {
  id: number;
  plate_number: string;
  vehicle_type: string;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  is_blacklisted: boolean;
  is_resident: boolean;
  customer_id: number | null;
  notes?: string | null;
}
interface HistoryRow {
  id: number; ticket_number: string; plate_number: string; entry_time: string; exit_time: string | null;
  duration_minutes: number | null; amount: string | null; status: string; payment_status: string;
}
interface NfcCard {
  id: number;
  card_uid: string;
  label: string | null;
  status: string;
  last_used_at: string | null;
}

const VEHICLE_TYPES = ["car", "suv", "truck", "bus", "motorcycle", "bicycle", "other"];

export default function CustomersPage() {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [edit, setEdit] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [detailVehicles, setDetailVehicles] = useState<Vehicle[] | null>(null);
  const [detailHistory, setDetailHistory] = useState<HistoryRow[] | null>(null);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [nfcCustomer, setNfcCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const sp = new URLSearchParams({ limit: "500" });
      if (debounced) sp.set("q", debounced);
      setCustomers(await apiGet<Customer[]>(`/api/membership/parking/customers?${sp}`));
    } catch (e: any) {
      setError(e.message);
      setCustomers([]);
    }
  }, [debounced]);
  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (c: Customer) => {
    setDetail(c);
    setDetailVehicles(null);
    setDetailHistory(null);
    try {
      const [v, h] = await Promise.all([
        apiGet<Vehicle[]>(`/api/membership/parking/vehicles?customer_id=${c.id}&limit=50`),
        apiGet<HistoryRow[]>(`/api/membership/parking/sessions?q=${encodeURIComponent(c.full_name)}&limit=25`),
      ]);
      setDetailVehicles(v);
      setDetailHistory(h);
    } catch {
      setDetailVehicles([]);
      setDetailHistory([]);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await apiDelete(`/api/membership/parking/customers/${confirmDelete.id}`);
      toast.success("Customer deleted");
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      toast.error("Cannot delete customer", e.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!customers) return;
    const header = ["ID", "Code", "Name", "Phone", "Email", "Status", "Member since"];
    const lines = customers.map((c) => [c.id, c.customer_id ?? "", c.full_name, c.phone ?? "", c.email ?? "", c.status, c.start_date]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `parking-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const columns: Column<Customer>[] = [
    {
      key: "full_name", label: "Customer",
      render: (c) => (
        <button className="group text-left" onClick={() => openDetail(c)}>
          <span className="block font-semibold text-[var(--text-primary)] group-hover:text-[var(--primary)] group-hover:underline">{c.full_name}</span>
          <span className="pk-num text-[11px] text-[var(--text-tertiary)]">{c.customer_id || `#${c.id}`}</span>
        </button>
      ),
    },
    { key: "phone", label: "Phone", render: (c) => (c.phone ? <span className="pk-num inline-flex items-center gap-1.5"><Phone size={12} className="text-[var(--text-tertiary)]" />{c.phone}</span> : "—") },
    { key: "email", label: "Email", hideBelow: "lg", render: (c) => c.email || "—" },
    { key: "member_since", label: "Member since", hideBelow: "md", render: (c) => fmtDate(c.start_date) },
    {
      key: "status", label: "Status", align: "center",
      render: (c) => <Badge tone={c.status === "active" ? "success" : c.status === "suspended" ? "warning" : "neutral"} dot>{c.status}</Badge>,
    },
    {
      key: "actions", label: "", align: "right", render: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="xs" variant="ghost" icon={<Nfc size={13} />} onClick={() => setNfcCustomer(c)} aria-label={`Issue NFC card for ${c.full_name}`} />
          <Button size="xs" variant="ghost" icon={<Eye size={13} />} onClick={() => openDetail(c)} aria-label={`View ${c.full_name}`} />
          <Button size="xs" variant="ghost" icon={<PencilIcon />} onClick={() => setEdit(c)} aria-label={`Edit ${c.full_name}`} />
          <Button size="xs" variant="ghost" className="text-[var(--accent-red)]" icon={<TrashIcon />} onClick={() => setConfirmDelete(c)} aria-label={`Delete ${c.full_name}`} />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">Customers</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Registered parkers, companies and their vehicles.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="md" icon={<Download size={14} />} onClick={exportCsv} disabled={!customers?.length}>Export CSV</Button>
          <Button size="md" icon={<UserPlus size={15} />} onClick={() => setEdit({ id: 0, customer_id: "", full_name: "", phone: "", email: "", status: "active", start_date: new Date().toISOString().slice(0, 10), end_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) })}>New customer</Button>
        </div>
      </div>

      <Card>
        <div className="border-b border-[var(--card-border)] px-5 py-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or code…" aria-label="Search customers" />
        </div>
        {error ? (
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-[13px] text-[var(--accent-red)]">Failed to load — {error}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        ) : !customers ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <DataTable columns={columns} rows={customers} rowKey={(c) => c.id}
            empty={<EmptyState icon={<Users size={20} />} title="No customers found" body={debounced ? `No customers match “${debounced}”.` : "Register your first customer to link vehicles, memberships and history."} action={<Button size="sm" onClick={() => setEdit({ id: 0, customer_id: "", full_name: "", phone: "", email: "", status: "active", start_date: new Date().toISOString().slice(0, 10), end_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) })}>Register customer</Button>} />}
          />
        )}
      </Card>

      <CustomerDialog customer={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      <VehicleDialog vehicle={editVehicle} customers={customers ?? []} onClose={() => setEditVehicle(null)} onSaved={() => { setEditVehicle(null); if (detail) openDetail(detail); }} />
      <NfcIssueDialog customer={nfcCustomer} onClose={() => setNfcCustomer(null)} />

      {/* detail drawer */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.full_name ?? ""} subtitle={detail ? `${detail.customer_id || `#${detail.id}`} · member since ${fmtDate(detail.start_date)}` : undefined} size="lg"
        footer={<Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-4 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]"><Phone size={13} />{detail.phone || "—"}</span>
              <span className="text-[var(--text-secondary)]">{detail.email || "—"}</span>
              <Badge tone={detail.status === "active" ? "success" : "neutral"} dot>{detail.status}</Badge>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Vehicles</h3>
                <Button size="xs" variant="outline" icon={<Plus size={12} />} onClick={() => setEditVehicle({ id: 0, plate_number: "", vehicle_type: "car", is_blacklisted: false, is_resident: false, customer_id: detail.id })}>Add vehicle</Button>
              </div>
              {!detailVehicles ? (
                <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
              ) : detailVehicles.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-center text-[13px] text-[var(--text-tertiary)]">No vehicles registered for this customer.</p>
              ) : (
                <ul className="space-y-2">
                  {detailVehicles.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--card-border)] px-4 py-3">
                      <Car size={15} className="text-[var(--text-tertiary)]" />
                      <span className="font-bold text-[var(--text-primary)]">{v.plate_number}</span>
                      <Badge tone="neutral">{v.vehicle_type}</Badge>
                      {v.vehicle_model && <span className="text-[12.5px] text-[var(--text-tertiary)]">{v.vehicle_model}{v.vehicle_color ? ` · ${v.vehicle_color}` : ""}</span>}
                      {v.is_resident && <Badge tone="purple">member</Badge>}
                      {v.is_blacklisted && <Badge tone="danger" dot>blacklisted</Badge>}
                      <Button size="xs" variant="ghost" className="ml-auto" icon={<PencilIcon />} onClick={() => setEditVehicle(v)} aria-label={`Edit vehicle ${v.plate_number}`} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"><Clock size={13} /> Recent parking history</h3>
              {!detailHistory ? (
                <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
              ) : detailHistory.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-center text-[13px] text-[var(--text-tertiary)]">No parking sessions recorded yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">
                  {detailHistory.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[12.5px]">
                      <span className="pk-num font-semibold">{h.ticket_number}</span>
                      <span className="text-[var(--text-secondary)]">{h.plate_number}</span>
                      <span className="text-[var(--text-tertiary)]">{relativeTime(h.entry_time)}</span>
                      <span className="ml-auto pk-num text-[var(--text-secondary)]">{h.status === "active" ? "—" : fmtMoney(h.amount)}</span>
                      <Badge tone={h.status === "active" ? "primary" : h.payment_status === "paid" ? "success" : "warning"} dot>{h.status === "active" ? "inside" : h.payment_status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={remove} loading={busy} danger
        title={confirmDelete ? `Delete ${confirmDelete.full_name}?` : ""}
        body="The customer record is removed. Historical parking sessions are preserved for audit." confirmLabel="Delete customer" />
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
  );
}

/* -------------------------------- dialogs --------------------------------- */

function NfcIssueDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const toast = useToast();
  const [uid, setUid] = useState("");
  const [label, setLabel] = useState("");
  const [cards, setCards] = useState<NfcCard[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadCards = useCallback(async () => {
    if (!customer) return;
    try {
      setCards(await apiGet<NfcCard[]>(`/api/membership/parking/rfid-cards?member_id=${customer.id}`));
    } catch {
      setCards([]);
    }
  }, [customer]);

  useEffect(() => {
    if (!customer) return;
    setUid("");
    setLabel("");
    setError(null);
    setCards(null);
    loadCards();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [customer, loadCards]);

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }, []);

  const startScan = async () => {
    setError(null);
    if (!isWebNfcSupported()) {
      setError("Web NFC is not supported here. Use Chrome on Android over HTTPS, or type the card UID.");
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
      setUid(cardUid);
      stopScan();
      toast.success("NFC tag read", cardUid);
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

  const issue = async () => {
    if (!customer) return;
    const cardUid = normalizeCardUid(uid);
    if (!cardUid) {
      setError("Tap an NFC tag or enter its UID first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/membership/parking/rfid-cards", {
        card_uid: cardUid,
        member_id: customer.id,
        label: label.trim() || `NFC - ${customer.full_name}`,
      });
      toast.success("NFC card issued", `${cardUid} → ${customer.full_name}`);
      setUid("");
      setLabel("");
      await loadCards();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!customer}
      onClose={onClose}
      title="Issue NFC card"
      subtitle={customer ? `${customer.full_name} - ${customer.customer_id || `#${customer.id}`}` : undefined}
      size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" loading={busy} disabled={!uid.trim()} onClick={issue} icon={<Nfc size={14} />}>
            Issue card
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-sunken)] px-4 py-4">
          <p className="text-[12.5px] text-[var(--text-secondary)]">
            Hold the NFC tag against the back of an Android phone, then tap Scan. The UID is filled in automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={scanning} onClick={startScan} icon={<Nfc size={14} />}>
              {scanning ? "Scanning…" : "Scan NFC tag"}
            </Button>
            {scanning && (
              <Button size="sm" variant="ghost" onClick={stopScan}>
                Stop
              </Button>
            )}
          </div>
        </div>

        <Field label="Card UID" required hint="Scanned automatically, or type the UID printed on the tag.">
          <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04:A1:B2:C3:…" autoComplete="off" />
        </Field>
        <Field label="Label (optional)">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`e.g. NFC - ${customer?.full_name ?? "member"}`} />
        </Field>

        {error && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-[12.5px] text-[var(--accent-red)]">
            {error}
          </p>
        )}

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Cards linked to this customer
          </p>
          {!cards ? (
            <Skeleton className="h-12" />
          ) : cards.length === 0 ? (
            <p className="text-[13px] text-[var(--text-tertiary)]">No NFC card issued yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">
              {cards.map((card) => (
                <li key={card.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-[12.5px]">
                  <span className="pk-num font-semibold">{card.card_uid}</span>
                  <span className="text-[var(--text-tertiary)]">{card.label || "Unlabelled"}</span>
                  <Badge
                    tone={card.status === "active" ? "success" : card.status === "lost" || card.status === "blocked" ? "danger" : "neutral"}
                    className="ml-auto"
                  >
                    {card.status}
                  </Badge>
                  {card.last_used_at && (
                    <span className="w-full text-[11px] text-[var(--text-tertiary)]">
                      Last used {relativeTime(card.last_used_at)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function CustomerDialog({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Customer>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(customer ?? {}), [customer]);
  if (!customer) return null;
  const isNew = customer.id === 0;

  const save = async () => {
    if (!form.full_name?.trim()) {
      toast.error("Full name is required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        full_name: form.full_name.trim(), phone: form.phone || null, email: form.email || null,
        status: form.status || "active", notes: form.notes || null,
        start_date: form.start_date, end_date: form.end_date,
      };
      if (isNew) {
        const res = await apiPost<any>("/api/membership/parking/customers", body);
        if (res?.customer?.customer_id || res?.customer_id) {
          // keep returned code visible in list
        }
      } else {
        await apiPut(`/api/membership/parking/customers/${customer.id}`, body);
      }
      toast.success(isNew ? "Customer registered" : "Customer updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isNew ? "Register customer" : `Edit ${customer.full_name}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Register" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={form.full_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Person or company name" />
        </Field>
        <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+251…" /></Field>
        <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        <Field label="Status">
          <Select value={form.status ?? "active"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {["active", "expired", "suspended", "cancelled"].map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </Select>
        </Field>
        <Field label="Notes"><Input value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
      </div>
    </Dialog>
  );
}

function VehicleDialog({ vehicle, customers, onClose, onSaved }: { vehicle: Vehicle | null; customers: Customer[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Vehicle>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(vehicle ?? {}), [vehicle]);
  if (!vehicle) return null;
  const isNew = vehicle.id === 0;

  const save = async () => {
    if (!form.plate_number?.trim()) {
      toast.error("Plate number is required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        plate_number: form.plate_number.trim().toUpperCase(),
        vehicle_type: form.vehicle_type || "car",
        vehicle_model: form.vehicle_model || null,
        vehicle_color: form.vehicle_color || null,
        owner_name: form.owner_name || null,
        owner_phone: form.owner_phone || null,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        is_blacklisted: !!form.is_blacklisted,
        is_resident: !!form.is_resident,
        notes: form.notes || null,
      };
      if (isNew) await apiPost("/api/membership/parking/vehicles", body);
      else await apiPut(`/api/membership/parking/vehicles/${vehicle.id}`, body);
      toast.success(isNew ? "Vehicle registered" : "Vehicle updated");
      onSaved();
    } catch (e: any) {
      toast.error("Save failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isNew ? "Register vehicle" : `Edit vehicle ${vehicle.plate_number}`} size="md"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={save}>{isNew ? "Register" : "Save"}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Plate number" required>
          <Input value={form.plate_number ?? ""} onChange={(e) => setForm((f) => ({ ...f, plate_number: e.target.value.toUpperCase() }))} placeholder="ABC-1234" />
        </Field>
        <Field label="Vehicle type">
          <Select value={form.vehicle_type ?? "car"} onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}>
            {VEHICLE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </Select>
        </Field>
        <Field label="Model"><Input value={form.vehicle_model ?? ""} onChange={(e) => setForm((f) => ({ ...f, vehicle_model: e.target.value }))} placeholder="Toyota Corolla" /></Field>
        <Field label="Color"><Input value={form.vehicle_color ?? ""} onChange={(e) => setForm((f) => ({ ...f, vehicle_color: e.target.value }))} /></Field>
        <Field label="Owner name"><Input value={form.owner_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))} /></Field>
        <Field label="Owner phone"><Input value={form.owner_phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, owner_phone: e.target.value }))} /></Field>
        <Field label="Linked customer" className="sm:col-span-2">
          <Select value={form.customer_id ? String(form.customer_id) : ""} onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— unlinked —</option>
            {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.full_name}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={!!form.is_resident} onChange={(e) => setForm((f) => ({ ...f, is_resident: e.target.checked }))} className="h-4 w-4 rounded border-[var(--border-strong)]" />
          <span className="text-[13px] text-[var(--text-secondary)]">Member / resident vehicle</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={!!form.is_blacklisted} onChange={(e) => setForm((f) => ({ ...f, is_blacklisted: e.target.checked }))} className="h-4 w-4 rounded border-[var(--border-strong)]" />
          <span className="text-[13px] font-medium text-[var(--accent-red)]">Blacklisted — entry refused</span>
        </label>
      </div>
    </Dialog>
  );
}
