"use client";
import { useEffect, useState } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { QrCode, Plus, X, Save } from "lucide-react";

export default function ParkingQrTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState<any>({ visitor_name: "", visitor_phone: "", visitor_plate: "", purpose: "", host_name: "", host_phone: "", valid_hours: "2" });
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`/api/membership/parking/qr-tickets?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setTickets(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/qr-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) { setShowForm(false); setForm({ visitor_name: "", visitor_phone: "", visitor_plate: "", purpose: "", host_name: "", host_phone: "", valid_hours: "2" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, "success" | "default" | "warning" | "danger"> = { active: "success", used: "default", expired: "warning", cancelled: "danger" };
    return <GemBadge variant={map[s] || "default"}>{s}</GemBadge>;
  };

  const copyQr = (code: string) => {
    try {
      const data = JSON.parse(atob(code));
      navigator.clipboard.writeText(JSON.stringify(data));
      alert("QR data copied to clipboard");
    } catch { navigator.clipboard.writeText(code); alert("QR code copied"); }
  };

  return (
    <GemPage>
      <GemHeader
        title="QR Gate Entry Tickets"
        subtitle="Generate QR codes for visitor gate entry"
        actions={
          <GemBtn onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "Generate QR Ticket"}
          </GemBtn>
        }
      />

      <div className="mb-4 w-40">
        <GemSelect value={filterStatus} onChange={(e: any) => setFilterStatus(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="used">Used</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </GemSelect>
      </div>

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><QrCode size={18} />Generate QR Entry Ticket</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Visitor Name <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.visitor_name} onChange={(e: any) => setForm({...form, visitor_name: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Phone</label>
              <GemInput type="text" value={form.visitor_phone} onChange={(e: any) => setForm({...form, visitor_phone: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Plate Number</label>
              <GemInput type="text" value={form.visitor_plate} onChange={(e: any) => setForm({...form, visitor_plate: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Valid (hours)</label>
              <GemInput type="number" value={form.valid_hours} onChange={(e: any) => setForm({...form, valid_hours: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Purpose</label>
              <GemInput type="text" value={form.purpose} onChange={(e: any) => setForm({...form, purpose: e.target.value})} placeholder="Meeting, Delivery, etc." />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Host Name</label>
              <GemInput type="text" value={form.host_name} onChange={(e: any) => setForm({...form, host_name: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Host Phone</label>
              <GemInput type="text" value={form.host_phone} onChange={(e: any) => setForm({...form, host_phone: e.target.value})} />
            </div>
            <div className="flex items-end">
              <GemBtn type="submit" disabled={saving}>
                <QrCode size={16} />{saving ? "Generating..." : "Generate QR Ticket"}
              </GemBtn>
            </div>
          </form>
        </GemCard>
      )}

      <GemCardBare>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><QrCode size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No QR tickets generated</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Ticket", "Visitor", "Phone", "Plate", "Host", "Valid From", "Valid Until", "Status", "QR"]}
              rows={tickets.map(t => [
                <span className="text-sm text-gray-400">{t.ticket_number}</span>,
                <span className="font-semibold">{t.visitor_name}</span>,
                <span className="text-sm">{t.visitor_phone || "-"}</span>,
                <span className="text-sm">{t.visitor_plate || "-"}</span>,
                <span className="text-sm">{t.host_name || "-"}</span>,
                <span className="text-sm">{new Date(t.valid_from).toLocaleString()}</span>,
                <span className="text-sm">{new Date(t.valid_until).toLocaleString()}</span>,
                statusBadge(t.status),
                <button className="text-blue-600 hover:text-blue-800 transition-colors" onClick={() => copyQr(t.qr_code)}>
                  <QrCode size={16} />
                </button>,
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
