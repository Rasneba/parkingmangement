"use client";
import { useEffect, useState } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemBtnOutline, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { BarChart3, Printer, Download, X } from "lucide-react";

export default function ParkingReportsPage() {
  const [tab, setTab] = useState("subscriptions");

  return (
    <GemPage>
      <GemHeader title="Parking Reports" subtitle="Subscription reports and access log reports" />

      <GemCardBare>
        <div className="p-4 border-b border-gray-100">
          <div className="flex gap-1">
            {[
              { key: "subscriptions", label: "Subscription Report" },
              { key: "access-logs", label: "Session Logs" },
              { key: "swipes", label: "Controller Swipes" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-6">
          {tab === "subscriptions" && <SubscriptionReport />}
          {tab === "access-logs" && <AccessLogReport />}
          {tab === "swipes" && <ControllerSwipesReport />}
        </div>
      </GemCardBare>
    </GemPage>
  );
}

function SubscriptionReport() {
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/membership/parking/reports/subscriptions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus, from, to]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <GemSelect value={filterStatus} onChange={(e: any) => setFilterStatus(e.target.value)} className="w-36">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </GemSelect>
        <GemInput type="date" value={from} onChange={(e: any) => setFrom(e.target.value)} className="w-40" />
        <GemInput type="date" value={to} onChange={(e: any) => setTo(e.target.value)} className="w-40" />
        <GemBtnOutline onClick={() => window.print()}><Printer size={14} />Print</GemBtnOutline>
      </div>

      {data.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {[
            { label: "Total Subscriptions", value: data.summary.total },
            { label: "Active", value: data.summary.active_count },
            { label: "Expired", value: data.summary.expired_count },
            { label: "Cancelled", value: data.summary.cancelled_count },
            { label: "Active Revenue", value: `ETB ${Number(data.summary.active_revenue).toLocaleString()}` },
            { label: "Total Revenue", value: `ETB ${Number(data.summary.total_revenue).toLocaleString()}` },
          ].map(card => (
            <div key={card.label} className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="text-lg font-bold">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <GemTable
          headers={["Customer", "Phone", "Plate", "Plan", "Start", "End", "Amount", "Payment", "Status"]}
          rows={loading ? [] : data.rows?.map((s: any) => [
            <span className="text-sm">{s.customer_name}<br /><span className="text-gray-400 text-[10px]">{s.customer_code}</span></span>,
            <span className="text-sm">{s.customer_phone}</span>,
            <span className="text-sm">{s.plate_number || "-"}</span>,
            <GemBadge variant="info">{s.plan_type}</GemBadge>,
            <span className="text-sm">{new Date(s.start_date).toLocaleDateString()}</span>,
            <span className="text-sm">{new Date(s.end_date).toLocaleDateString()}</span>,
            <span className="font-semibold">ETB {Number(s.amount).toLocaleString()}</span>,
            <span className="text-sm text-gray-400">{s.payment_method}</span>,
            <GemBadge variant={s.status === "active" ? "success" : s.status === "expired" ? "default" : "danger"}>{s.status}</GemBadge>,
          ]) || []}
        />
        {loading && <div className="flex justify-center py-4"><div className="w-6 h-6 border-3 border-black/20 border-t-black rounded-full animate-spin" /></div>}
        {!loading && data.rows?.length === 0 && <div className="text-center text-gray-400 py-6 text-sm">No subscription data</div>}
      </div>
    </div>
  );
}

function ControllerSwipesReport() {
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [card, setCard] = useState("");
  const [grantedFilter, setGrantedFilter] = useState("");
  const [direction, setDirection] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 100;
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (card) params.set("card", card);
      if (grantedFilter) params.set("granted", grantedFilter);
      if (direction) params.set("direction", direction);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));
      const res = await fetch(`/api/membership/parking/reports/controller-swipes?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [from, to, card, grantedFilter, direction, page]);

  const fmt = (d: string) => {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <GemInput type="date" value={from} onChange={(e: any) => { setFrom(e.target.value); setPage(0); }} className="w-40" />
        <GemInput type="date" value={to} onChange={(e: any) => { setTo(e.target.value); setPage(0); }} className="w-40" />
        <GemInput placeholder="Card UID" value={card} onChange={(e: any) => { setCard(e.target.value); setPage(0); }} className="w-36" />
        <GemSelect value={grantedFilter} onChange={(e: any) => { setGrantedFilter(e.target.value); setPage(0); }} className="w-32">
          <option value="">All Results</option>
          <option value="true">Granted</option>
          <option value="false">Denied</option>
        </GemSelect>
        <GemSelect value={direction} onChange={(e: any) => { setDirection(e.target.value); setPage(0); }} className="w-36">
          <option value="">All Directions</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </GemSelect>
        <GemBtnOutline onClick={() => { setFrom(""); setTo(""); setCard(""); setGrantedFilter(""); setDirection(""); setPage(0); }}>
          <X size={14} />Clear
        </GemBtnOutline>
      </div>

      {data.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {[
            { label: "Total Swipes", value: data.summary.total_swipes },
            { label: "Granted", value: data.summary.granted_count },
            { label: "Denied", value: data.summary.denied_count },
            { label: "Raw (no lookup)", value: data.summary.raw_count },
            { label: "Unique Cards", value: data.summary.unique_cards },
          ].map(c => (
            <div key={c.label} className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-lg font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto" style={{ maxHeight: "600px", overflowY: "auto" }}>
        <GemTable
          headers={["Time", "Card UID", "Member", "Direction", "Event", "Result", "Days Left", "Reason"]}
          rows={loading ? [] : data.rows?.map((r: any) => [
            <span className="text-sm text-nowrap">{fmt(r.created_at)}</span>,
            <code className="text-xs">{r.card_uid}</code>,
            <span className="text-sm">{r.member_name || <span className="text-gray-400 italic">Unknown</span>}</span>,
            r.direction ? <GemBadge variant={r.direction === "IN" ? "success" : "warning"}>{r.direction}</GemBadge> : <span className="text-gray-400">&mdash;</span>,
            <span className="text-sm text-gray-400">{r.event_type || "SWIPE"}</span>,
            r.granted ? <GemBadge variant="success">GRANTED</GemBadge> : r.reason === "RAW_SWIPE" ? <GemBadge>PENDING</GemBadge> : <GemBadge variant="danger">DENIED</GemBadge>,
            r.days_remaining > 0 ? <span className="font-bold text-sm text-emerald-600">{r.days_remaining}d</span> : r.days_remaining === 0 && r.granted ? <span className="font-bold text-sm text-red-500">Expired</span> : <span className="text-gray-400">&mdash;</span>,
            <span className="text-sm text-gray-400">{r.reason || "&mdash;"}</span>,
          ]) || []}
        />
        {loading && <div className="flex justify-center py-4"><div className="w-6 h-6 border-3 border-black/20 border-t-black rounded-full animate-spin" /></div>}
        {!loading && data.rows?.length === 0 && <div className="text-center text-gray-400 py-6 text-sm">No swipe data. Start scanning cards at the controller.</div>}
      </div>

      {data.total > pageSize && (
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-gray-400">Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, data.total)} of {data.total}</span>
          <div className="flex gap-1">
            <GemBtnOutline onClick={() => setPage(p => p - 1)} className={page === 0 ? "opacity-40 pointer-events-none" : ""}>Prev</GemBtnOutline>
            <GemBtnOutline onClick={() => setPage(p => p + 1)} className={(page + 1) * pageSize >= data.total ? "opacity-40 pointer-events-none" : ""}>Next</GemBtnOutline>
          </div>
        </div>
      )}
    </div>
  );
}

function AccessLogReport() {
  const [data, setData] = useState<any>({ rows: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [plate, setPlate] = useState("");
  const [status, setStatus] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const fmt = (d: string) => {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (plate) params.set("plate", plate);
      if (status) params.set("status", status);
      const res = await fetch(`/api/membership/parking/reports/access-logs?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [from, to, plate, status]);

  const exportCsv = () => {
    if (!data.rows?.length) return;
    const headers = ["Ticket","Plate","Customer","Phone","Vehicle Type","Entry Gate","Entry Time","Exit Gate","Exit Time","Duration (min)","Zone","Slot","Amount","Payment Method","Status"];
    const csv = [
      headers.join(","),
      ...data.rows.map((r: any) => [
        r.ticket_number, r.plate_number, r.customer_name || "", r.customer_phone || "", r.vehicle_type || "",
        r.entry_gate || "", r.entry_time ? fmt(r.entry_time) : "",
        r.exit_gate || "", r.exit_time ? fmt(r.exit_time) : "",
        r.duration_minutes || "", r.zone_name || "", r.slot_number || "",
        r.amount || "", r.payment_method || "", r.session_status
      ].map(v => `"${v}"`).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "access-log-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <GemInput type="date" value={from} onChange={(e: any) => setFrom(e.target.value)} className="w-40" />
        <GemInput type="date" value={to} onChange={(e: any) => setTo(e.target.value)} className="w-40" />
        <GemInput placeholder="Plate number" value={plate} onChange={(e: any) => setPlate(e.target.value)} className="w-36" />
        <GemSelect value={status} onChange={(e: any) => setStatus(e.target.value)} className="w-40">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="pending_payment">Pending Payment</option>
          <option value="cancelled">Cancelled</option>
        </GemSelect>
        <GemBtnOutline onClick={exportCsv}><Download size={14} />Export CSV</GemBtnOutline>
      </div>

      {data.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {[
            { label: "Total Entries", value: data.summary.total_entries },
            { label: "Total Exits", value: data.summary.total_exits },
            { label: "Active Now", value: data.summary.active_sessions },
            { label: "Avg Duration", value: `${data.summary.avg_duration_minutes} min` },
            { label: "Total Revenue", value: `ETB ${Number(data.summary.total_revenue).toLocaleString()}` },
          ].map(c => (
            <div key={c.label} className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-lg font-bold">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto" style={{ maxHeight: "500px", overflowY: "auto" }}>
        <GemTable
          headers={["Ticket", "Plate", "Customer", "Vehicle", "Entry Gate", "Entry Time", "Exit Gate", "Exit Time", "Duration", "Slot", "Amount", "Payment", "Status"]}
          rows={loading ? [] : data.rows?.map((r: any, i: number) => [
            <span className="text-sm text-gray-400">{r.ticket_number}</span>,
            <span className="font-bold text-sm">{r.plate_number}</span>,
            <span className="text-sm">{r.customer_name || "-"}</span>,
            <span className="text-sm text-gray-400">{r.vehicle_type || "-"}</span>,
            <GemBadge variant="info">{r.entry_gate || "-"}</GemBadge>,
            <span className="text-sm">{r.entry_time ? fmt(r.entry_time) : "-"}</span>,
            <GemBadge>{r.exit_gate || "-"}</GemBadge>,
            <span className="text-sm">{r.exit_time ? fmt(r.exit_time) : "-"}</span>,
            <span className="text-sm">{r.duration_minutes ? `${Math.floor(r.duration_minutes / 60)}h ${r.duration_minutes % 60}m` : "-"}</span>,
            <span className="text-sm text-gray-400">{r.slot_number || "-"}</span>,
            <span className="font-semibold text-sm">{r.amount ? `ETB ${Number(r.amount).toLocaleString()}` : "-"}</span>,
            <span className="text-sm text-gray-400">{r.payment_method || "-"}</span>,
            <GemBadge variant={r.session_status === "active" ? "success" : r.session_status === "completed" ? "default" : r.session_status === "pending_payment" ? "warning" : "danger"}>{r.session_status}</GemBadge>,
          ]) || []}
        />
        {loading && <div className="flex justify-center py-4"><div className="w-6 h-6 border-3 border-black/20 border-t-black rounded-full animate-spin" /></div>}
        {!loading && data.rows?.length === 0 && <div className="text-center text-gray-400 py-6 text-sm">No access log data</div>}
      </div>
    </div>
  );
}
