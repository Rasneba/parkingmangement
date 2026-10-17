"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemKpi, GemBtn, GemBtnOutline, GemBadge, GemSelect, GemInput, GemAlert } from "@/lib/gem-ui";
import { ReportFilters, MembershipReportTable } from "@/components";
import { CalendarCheck, Plus, X, Download, Printer, Save, CreditCard, Users, TrendingUp, Clock, Edit3, Snowflake, BarChart3, Table2, QrCode } from "lucide-react";

export default function ParkingSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [form, setForm] = useState<any>({ customer_id: "", vehicle_id: "", plan_id: "", plan_type: "monthly", start_date: new Date().toISOString().split("T")[0], end_date: "", amount: "", payment_method: "cash", payment_reference: "", auto_renew: false, notes: "" });
  const [saving, setSaving] = useState(false);
  const [editingSub, setEditingSub] = useState<any>(null);
  const [freezing, setFreezing] = useState<number | null>(null);
  const [freezeModal, setFreezeModal] = useState<any>(null);
  const [freezeStart, setFreezeStart] = useState("");
  const [freezeEnd, setFreezeEnd] = useState("");
  const [reportView, setReportView] = useState(false);
  const [qrModal, setQrModal] = useState<any>(null);
  const [rfDateRange, setRfDateRange] = useState("01/01/2026 - 12/31/2026");
  const [rfFacility, setRfFacility] = useState("");
  const [rfPerson, setRfPerson] = useState("");
  const [rfCard, setRfCard] = useState("");
  const [rfFreez, setRfFreez] = useState("");
  const [rfRemaining, setRfRemaining] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const printRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const [subRes, custRes, vehRes, cardRes, plansRes] = await Promise.all([
        fetch(`/api/membership/parking/subscriptions?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/customers", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/vehicles", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/rfid-cards", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/plans", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const subData = await subRes.json();
      const custData = await custRes.json();
      const vehData = await vehRes.json();
      const cardData = await cardRes.json();
      const plansData = await plansRes.json();
      if (Array.isArray(subData)) setSubscriptions(subData);
      if (Array.isArray(custData)) setCustomers(custData);
      if (Array.isArray(vehData)) setVehicles(vehData);
      if (Array.isArray(cardData)) setCards(cardData); else if (cardData?.data) setCards(cardData.data);
      if (Array.isArray(plansData)) setPlans(plansData);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]);

  const filteredSubs = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let start: Date | null = null, end: Date | null = null;
    if (dateFilter === "daily") { start = new Date(today); end = new Date(today); }
    else if (dateFilter === "weekly") { start = new Date(today); start.setDate(start.getDate() - 7); end = new Date(today); }
    else if (dateFilter === "monthly") { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); }
    else if (dateFilter === "yearly") { start = new Date(today.getFullYear(), 0, 1); end = new Date(today.getFullYear(), 11, 31); }
    else if (dateFilter === "custom" && customStart && customEnd) { start = new Date(customStart); end = new Date(customEnd); }
    return subscriptions.filter(s => { const d = new Date(s.end_date); if (start && d < start) return false; if (end && d > end) return false; return true; });
  }, [subscriptions, dateFilter, customStart, customEnd]);

  const totalRevenue = useMemo(() => filteredSubs.reduce((s, sub) => s + Number(sub.amount), 0), [filteredSubs]);

  const groupedData = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredSubs.forEach((s, i) => {
      const key = s.plan_name || s.plan_type || "Uncategorized";
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        sn: i + 1,
        voucherNo: s.id?.toString() || `SUB-${i + 1}`,
        cardNumber: cards.filter(c => c.member_id === s.customer_id).map(c => c.card_uid).join(", ") || "—",
        name: s.customer_name || "N/A",
        remainingDays: s.status === "active" ? (() => {
          const diff = Math.ceil((new Date(s.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return diff > 0 ? diff : 0;
        })() : 0,
      });
    });
    return Object.entries(groups).map(([articleName, members]) => ({ articleName, members }));
  }, [filteredSubs, cards]);

  useEffect(() => {
    if (!form.start_date || !form.plan_id) return;
    const plan = plans.find(p => p.id === parseInt(form.plan_id));
    if (!plan || !plan.duration_days) return;
    const start = new Date(form.start_date);
    start.setDate(start.getDate() + plan.duration_days);
    const amount = form.amount || plan.price || "";
    setForm((f: any) => ({ ...f, end_date: start.toISOString().split("T")[0], amount }));
  }, [form.start_date, form.plan_id]);

  const remainingDays = (endDate: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return <GemBadge variant="danger">Expired</GemBadge>;
    if (diff === 0) return <GemBadge variant="warning">Today</GemBadge>;
    if (diff <= 7) return <GemBadge variant="warning">{diff}d left</GemBadge>;
    return <GemBadge variant="success">{diff}d left</GemBadge>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, customer_id: parseInt(form.customer_id), vehicle_id: form.vehicle_id ? parseInt(form.vehicle_id) : null, plan_id: form.plan_id ? parseInt(form.plan_id) : null, amount: parseFloat(form.amount) }),
      });
      if (res.ok) { setShowForm(false); setForm({ customer_id: "", vehicle_id: "", plan_id: "", plan_type: "monthly", start_date: new Date().toISOString().split("T")[0], end_date: "", amount: "", payment_method: "cash", payment_reference: "", auto_renew: false, notes: "" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const handleCancel = async (id: number) => {
    if (!token || !confirm("Cancel this subscription?")) return;
    try { await fetch(`/api/membership/parking/subscriptions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: "cancelled" }) }); load(); } catch {}
  };

  const handleEdit = (sub: any) => {
    setEditingSub(sub);
    setForm({
      customer_id: sub.customer_id?.toString() || "",
      vehicle_id: sub.vehicle_id?.toString() || "",
      plan_id: sub.plan_id?.toString() || "",
      plan_type: sub.plan_type || "monthly",
      start_date: sub.start_date?.split("T")[0] || new Date().toISOString().split("T")[0],
      end_date: sub.end_date?.split("T")[0] || "",
      amount: sub.amount?.toString() || "",
      payment_method: sub.payment_method || "cash",
      payment_reference: sub.payment_reference || "",
      auto_renew: sub.auto_renew || false,
      notes: sub.notes || "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFreeze = async (id: number, currentStatus: string) => {
    if (!token) return;
    if (currentStatus === "frozen") {
      if (!confirm("Unfreeze this subscription? End date will be extended by the freeze duration.")) return;
      setFreezing(id);
      try {
        await fetch(`/api/membership/parking/subscriptions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: "active" }),
        });
        load();
      } catch {}
      setFreezing(null);
    } else {
      const today = new Date().toISOString().split("T")[0];
      setFreezeStart(today);
      setFreezeEnd("");
      setFreezeModal({ id, sub: subscriptions.find((s: any) => s.id === id) });
    }
  };

  const confirmFreeze = async () => {
    if (!token || !freezeModal || !freezeStart || !freezeEnd) return;
    if (new Date(freezeEnd) < new Date(freezeStart)) { alert("Freeze end date must be after start date"); return; }
    setFreezing(freezeModal.id);
    try {
      await fetch(`/api/membership/parking/subscriptions/${freezeModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "frozen", freeze_start: freezeStart, freeze_end: freezeEnd }),
      });
      setFreezeModal(null);
      load();
    } catch {}
    setFreezing(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingSub) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/membership/parking/subscriptions/${editingSub.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, customer_id: parseInt(form.customer_id), vehicle_id: form.vehicle_id ? parseInt(form.vehicle_id) : null, plan_id: form.plan_id ? parseInt(form.plan_id) : null, amount: parseFloat(form.amount) }),
      });
      if (res.ok) { setShowForm(false); setEditingSub(null); setForm({ customer_id: "", vehicle_id: "", plan_id: "", plan_type: "monthly", start_date: new Date().toISOString().split("T")[0], end_date: "", amount: "", payment_method: "cash", payment_reference: "", auto_renew: false, notes: "" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const exportCsv = () => {
    const headers = ["Customer", "Phone", "Plate", "Plan", "Start", "End", "Issued Cards", "Amount", "Payment", "Status", "Auto Renew"];
    const rows = filteredSubs.map(s => {
      const subCards = cards.filter(c => c.member_id === s.customer_id).map(c => c.card_uid).join(";");
      return [s.customer_name, s.customer_phone, s.plate_number || "", s.plan_name || s.plan_type, new Date(s.start_date).toLocaleDateString(), new Date(s.end_date).toLocaleDateString(), subCards || "", s.amount, s.payment_method, s.status, s.auto_renew ? "Yes" : "No"];
    });
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "subscriptions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => { window.print(); };

  const handleQrDownload = (sub: any) => {
    setQrModal(sub);
  };

  const planBadge = (s: any) => {
    const label = s.plan_name || s.plan_type?.replace("_", " ") || "N/A";
    return <GemBadge variant="info">{label}</GemBadge>;
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: "success", expired: "default", cancelled: "danger", pending: "warning", frozen: "info" };
    return <GemBadge variant={(map[s] || "default") as any}>{s}</GemBadge>;
  };

  const activeCount = subscriptions.filter(s => s.status === "active").length;
  const frozenCount = subscriptions.filter(s => s.status === "frozen").length;
  const expiredCount = subscriptions.filter(s => s.status === "expired" || s.status === "cancelled").length;

  return (
    <GemPage>
      <GemHeader
        title="Subscription Management"
        subtitle="Manage customer subscriptions for monthly and annual parking plans"
        actions={
          <div className="flex items-center gap-3">
            <GemBtnOutline onClick={() => setReportView(!reportView)}>
              {reportView ? <Table2 size={15} /> : <BarChart3 size={15} />}
              {reportView ? "Table View" : "Report View"}
            </GemBtnOutline>
            <GemBtn onClick={() => setShowForm(!showForm)}>
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? "Cancel" : "New Subscription"}
            </GemBtn>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
        <GemKpi title="Total Subscriptions" value={subscriptions.length} icon={<CalendarCheck size={20} />} color="bg-blue-600" />
        <GemKpi title="Active" value={activeCount} icon={<Users size={20} />} color="bg-emerald-600" />
        <GemKpi title="Frozen" value={frozenCount} icon={<Snowflake size={20} />} color="bg-cyan-600" />
        <GemKpi title="Expired / Cancelled" value={expiredCount} icon={<Clock size={20} />} color="bg-amber-600" />
        <GemKpi title="Total Revenue" value={`ETB ${totalRevenue.toLocaleString()}`} icon={<TrendingUp size={20} />} color="bg-black" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <GemSelect value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 140 }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="frozen">Frozen</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </GemSelect>
        <GemSelect value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: 140 }}>
          <option value="all">All Dates</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
          <option value="custom">Custom Range</option>
        </GemSelect>
        {dateFilter === "custom" && (
          <>
            <GemInput type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ width: 150 }} />
            <GemInput type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ width: 150 }} />
          </>
        )}
        <div className="flex-1"></div>
        <GemBtnOutline onClick={exportCsv}><Download size={15} /> Export</GemBtnOutline>
        <GemBtnOutline onClick={handlePrint}><Printer size={15} /> Print</GemBtnOutline>
      </div>

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            {editingSub ? <Edit3 size={18} /> : <Plus size={18} />}
            {editingSub ? "Edit Subscription" : "Create Subscription"}
            {editingSub && (
              <button
                type="button"
                onClick={() => { setEditingSub(null); setForm({ customer_id: "", vehicle_id: "", plan_id: "", plan_type: "monthly", start_date: new Date().toISOString().split("T")[0], end_date: "", amount: "", payment_method: "cash", payment_reference: "", auto_renew: false, notes: "" }); setShowForm(false); }}
                className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={14} /> Cancel Edit
              </button>
            )}
          </h3>
          <form onSubmit={editingSub ? handleUpdate : handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Customer <span className="text-red-500">*</span></label>
                <GemSelect required value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})}>
                  <option value="">Select Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.customer_id} - {c.full_name} ({c.phone})</option>)}
                </GemSelect>
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Vehicle</label>
                <GemSelect value={form.vehicle_id} onChange={e => setForm({...form, vehicle_id: e.target.value})}>
                  <option value="">No Vehicle</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} - {v.vehicle_type}</option>)}
                </GemSelect>
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Plan <span className="text-red-500">*</span></label>
                <GemSelect required value={form.plan_id} onChange={e => {
                  const plan = plans.find(p => p.id === parseInt(e.target.value));
                  setForm({...form, plan_id: e.target.value, plan_type: plan?.type || "custom", amount: plan?.price || "" });
                }}>
                  <option value="">Select Plan</option>
                  {plans.filter(p => p.is_active !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.name} - ETB {Number(p.price).toLocaleString()} / {p.duration_days}d</option>
                  ))}
                </GemSelect>
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Amount (ETB) <span className="text-red-500">*</span></label>
                <GemInput type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Start Date</label>
                <GemInput type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">End Date <span className="text-red-500">*</span></label>
                <GemInput type="date" required value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} disabled={!!form.plan_id} />
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Payment Method</label>
                <GemSelect value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
                  <option value="cash">Cash</option>
                  <option value="telebirr">Telebirr</option>
                  <option value="cbebirr">CBE Birr</option>
                  <option value="chapa">Chapa</option>
                  <option value="addispay">AddisPay</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="debit_card">Debit Card</option>
                </GemSelect>
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Payment Reference</label>
                <GemInput type="text" value={form.payment_reference} onChange={e => setForm({...form, payment_reference: e.target.value})} />
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300" checked={form.auto_renew} onChange={e => setForm({...form, auto_renew: e.target.checked})} />
                  <span className="text-sm text-gray-600 font-medium">Auto Renew</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Notes</label>
                <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
            </div>
            <div className="mt-5">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />
                {saving ? "Saving..." : editingSub ? "Update Subscription" : "Create Subscription"}
              </GemBtn>
            </div>
          </form>
        </GemCard>
      )}

      {reportView ? (
        <div>
          <ReportFilters
            dateRange={rfDateRange}
            onDateRangeChange={setRfDateRange}
            facility={rfFacility}
            onFacilityChange={setRfFacility}
            facilityOptions={[]}
            person={rfPerson}
            onPersonChange={setRfPerson}
            personOptions={customers.map(c => ({ value: String(c.id), label: `${c.customer_id} - ${c.full_name}` }))}
            card={rfCard}
            onCardChange={setRfCard}
            cardOptions={cards.map(c => ({ value: String(c.id), label: c.card_uid }))}
            freez={rfFreez}
            onFreezChange={setRfFreez}
            remaining={rfRemaining}
            onRemainingChange={setRfRemaining}
          />
          <div className="border border-t-0 border-gray-200 rounded-b-md p-4">
            <MembershipReportTable groupedData={groupedData} />
          </div>
        </div>
      ) : (
        <div ref={printRef}>
        <GemCardBare>
        {loading ? (
          <div className="text-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto"></div>
          </div>
        ) : filteredSubs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarCheck size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-sm font-medium">No subscriptions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["#", "Customer", "Phone", "Plate", "Plan", "Start", "End", "Remaining", "Cards", "Amount", "Payment", "Status", "Freeze", "Auto", ""].map(h => (
                    <th key={h} className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wider px-4 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((s, i) => {
                  const subCards = cards.filter(c => c.member_id === s.customer_id);
                  return (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-gray-400">{i + 1}</td>
                      <td className="py-3.5 px-4">
                        <div className="text-sm font-semibold">{s.customer_name}</div>
                        <div className="text-xs text-gray-400">{s.customer_code}</div>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-gray-600">{s.customer_phone}</td>
                      <td className="py-3.5 px-4 text-sm">{s.plate_number || <span className="text-gray-300">—</span>}</td>
                      <td className="py-3.5 px-4">{planBadge(s)}</td>
                      <td className="py-3.5 px-4 text-sm text-gray-600">{new Date(s.start_date).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4 text-sm text-gray-600">{new Date(s.end_date).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4">{remainingDays(s.end_date)}</td>
                      <td className="py-3.5 px-4">
                        {subCards.length > 0
                          ? subCards.map(c => (
                              <span key={c.id} className="inline-flex items-center gap-1 mr-1.5 mb-1">
                                <code className="text-xs bg-gray-50 px-1.5 py-0.5 rounded font-mono">{c.card_uid}</code>
                                <GemBadge variant={c.status === "active" ? "success" : "default"}>{c.status}</GemBadge>
                              </span>
                            ))
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-sm">ETB {Number(s.amount).toLocaleString()}</td>
                      <td className="py-3.5 px-4 text-sm text-gray-500">{s.payment_method}</td>
                      <td className="py-3.5 px-4">{statusBadge(s.status)}</td>
                      <td className="py-3.5 px-4 text-xs text-gray-500">
                        {s.freeze_start && s.freeze_end ? (
                          <div>
                            <div>{new Date(s.freeze_start).toLocaleDateString()}</div>
                            <div className="text-gray-400">to {new Date(s.freeze_end).toLocaleDateString()}</div>
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3.5 px-4">{s.auto_renew ? <GemBadge variant="info">Yes</GemBadge> : <span className="text-gray-300 text-sm">No</span>}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1">
                          <button className="text-purple-500 hover:text-purple-700 transition-colors p-1" onClick={() => handleQrDownload(s)} title="QR Code">
                            <QrCode size={15} />
                          </button>
                          <button className="text-blue-500 hover:text-blue-700 transition-colors p-1" onClick={() => handleEdit(s)} title="Edit">
                            <Edit3 size={15} />
                          </button>
                          {(s.status === "active" || s.status === "frozen") && (
                            <button
                              className={`transition-colors p-1 ${s.status === "frozen" ? "text-green-500 hover:text-green-700" : "text-blue-400 hover:text-blue-600"}`}
                              onClick={() => handleFreeze(s.id, s.status)}
                              disabled={freezing === s.id}
                              title={s.status === "frozen" ? "Unfreeze" : "Freeze"}
                            >
                              <Snowflake size={15} className={s.status === "frozen" ? "text-blue-500" : ""} />
                            </button>
                          )}
                          {s.status === "active" && (
                            <button className="text-red-500 hover:text-red-700 transition-colors p-1" onClick={() => handleCancel(s.id)} title="Cancel">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filteredSubs.length > 0 && (
          <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 text-sm">
            <span className="text-gray-500">Total: {filteredSubs.length} subscriptions</span>
            <span className="font-bold">Total Revenue: ETB {totalRevenue.toLocaleString()}</span>
          </div>
        )}
      </GemCardBare>
      </div>
      )}
      {qrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQrModal(null)}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Subscription QR</h3>
              <button onClick={() => setQrModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="text-center">
              {qrModal.qr_image ? (
                <img src={qrModal.qr_image} alt="QR Code" className="mx-auto mb-4 rounded-xl" style={{ width: 220, height: 220 }} />
              ) : (
                <div className="w-56 h-56 bg-gray-100 rounded-xl mx-auto mb-4 flex items-center justify-center text-gray-400">No QR</div>
              )}
              <p className="text-sm font-semibold mb-1">{qrModal.customer_name}</p>
              <p className="text-xs text-gray-500 mb-1">Sub #{qrModal.id} &middot; {qrModal.plan_name || qrModal.plan_type}</p>
              <p className="text-xs text-gray-400 mb-4">Valid until {new Date(qrModal.end_date).toLocaleDateString()}</p>
              <button
                onClick={() => {
                  if (!qrModal.qr_image) return;
                  const a = document.createElement("a");
                  a.href = qrModal.qr_image;
                  a.download = `sub-${qrModal.id}-qr.png`;
                  a.click();
                }}
                className="inline-flex items-center gap-2 bg-black text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-gray-800 transition-colors"
              >
                <Download size={15} /> Download QR
              </button>
            </div>
          </div>
        </div>
      )}
      {freezeModal && (
        <GemCard className="mb-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Snowflake size={18} className="text-blue-500" />
            Freeze Subscription
            <button
              type="button"
              onClick={() => { setFreezeModal(null); setFreezeStart(""); setFreezeEnd(""); }}
              className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={14} /> Cancel
            </button>
          </h3>
          <div className="mb-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-800 flex items-center gap-3">
            <div>
              <p className="font-semibold">{freezeModal.sub?.customer_name}</p>
              <p className="text-xs text-blue-600 mt-0.5">Sub #{freezeModal.sub?.id} &middot; {freezeModal.sub?.plan_name || freezeModal.sub?.plan_type} &middot; Ends: {new Date(freezeModal.sub?.end_date).toLocaleDateString()}</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-4">During the freeze period the door will not open. After unfreezing, the end date will be extended by the freeze duration.</p>
          <form onSubmit={e => { e.preventDefault(); confirmFreeze(); }}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Freeze Start Date <span className="text-red-500">*</span></label>
                <GemInput type="date" required value={freezeStart} onChange={e => setFreezeStart(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1.5 block">Freeze End Date <span className="text-red-500">*</span></label>
                <GemInput type="date" required value={freezeEnd} onChange={e => setFreezeEnd(e.target.value)} />
              </div>
              {freezeStart && freezeEnd && new Date(freezeEnd) >= new Date(freezeStart) && (
                <div className="flex items-end">
                  <div className="p-2.5 bg-amber-50 rounded-xl text-xs text-amber-700 w-full">
                    Duration: {Math.ceil((new Date(freezeEnd).getTime() - new Date(freezeStart).getTime()) / (1000 * 60 * 60 * 24))} days &middot; End date will be extended by this amount
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5">
              <GemBtn type="submit" disabled={!freezeStart || !freezeEnd || freezing === freezeModal.id}>
                <Snowflake size={15} />
                {freezing === freezeModal.id ? "Freezing..." : "Confirm Freeze"}
              </GemBtn>
            </div>
          </form>
        </GemCard>
      )}
    </GemPage>
  );
}
