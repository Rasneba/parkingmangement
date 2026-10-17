"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GemPage, GemHeader, GemCardBare, GemBtn, GemBtnOutline, GemTable, GemBadge, GemSelect, GemInput } from "@/lib/gem-ui";
import { Clock, Monitor, LogOut } from "lucide-react";

export default function ParkingSessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterDate, setFilterDate] = useState("");
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterDate) params.set("date", filterDate);
      const res = await fetch(`/api/membership/parking/sessions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus, filterDate]);
  useEffect(() => { if (filterStatus !== "active") return; const iv = setInterval(load, 10000); return () => clearInterval(iv); }, [filterStatus]);

  const handleExit = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/membership/parking/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ exit_time: new Date().toISOString(), status: "pending_payment" }),
      });
      if (res.ok) load();
      else { const err = await res.json(); alert(err.error); }
    } catch {}
  };

  const statusBadge = (s: string) => {
    const map: Record<string, "success" | "default" | "warning" | "danger"> = { active: "success", completed: "default", pending_payment: "warning", cancelled: "danger" };
    return <GemBadge variant={map[s] || "default"}>{s}</GemBadge>;
  };

  return (
    <GemPage>
      <GemHeader
        title="Parking Sessions"
        subtitle="Active and completed parking sessions"
        actions={
          <Link href="/dashboard/membership/parking/pos" className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-medium transition-all hover:opacity-90 active:scale-[0.97] inline-flex items-center gap-2">
            <Monitor size={16} />POS Terminal
          </Link>
        }
      />

      <div className="flex gap-2 mb-4">
        <GemSelect value={filterStatus} onChange={(e: any) => setFilterStatus(e.target.value)} className="w-44">
          <option value="active">Active</option>
          <option value="pending_payment">Pending Payment</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="">All</option>
        </GemSelect>
        <GemInput type="date" value={filterDate} onChange={(e: any) => setFilterDate(e.target.value)} className="w-44" />
      </div>

      <GemCardBare>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><Clock size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No sessions found</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Ticket", "Plate", "Owner", "Entry Gate", "Entry Time", "Exit Gate", "Exit Time", "Duration", "Slot", "Amount", "Status", "Action"]}
              rows={sessions.map(s => [
                <span className="text-sm text-gray-400">{s.ticket_number}</span>,
                <span className="font-bold">{s.plate_number || s.vehicle_plate}</span>,
                <span className="text-sm">{s.owner_name || "-"}</span>,
                <GemBadge variant="info">{s.entry_gate_name || "-"}</GemBadge>,
                <span className="text-sm">{new Date(s.entry_time).toLocaleString()}</span>,
                <GemBadge>{s.exit_gate_name || "-"}</GemBadge>,
                <span className="text-sm">{s.exit_time ? new Date(s.exit_time).toLocaleString() : "-"}</span>,
                s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m` : "-",
                <span className="text-sm text-gray-400">{s.slot_number || "-"}</span>,
                <span className="font-semibold">{s.amount ? `ETB ${Number(s.amount).toLocaleString()}` : "-"}</span>,
                statusBadge(s.status),
                s.status === "active" ? (
                  <button className="text-amber-600 hover:text-amber-800 text-sm font-medium inline-flex items-center gap-1 transition-colors" onClick={() => handleExit(s.id)}>
                    <LogOut size={14} />Exit
                  </button>
                ) : s.status === "pending_payment" ? (
                  <Link href={`/dashboard/membership/parking/pos?session=${s.id}`} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-all hover:opacity-90">
                    Pay
                  </Link>
                ) : null,
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
