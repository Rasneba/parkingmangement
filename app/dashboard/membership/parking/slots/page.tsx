"use client";
import { useEffect, useState } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { LayoutGrid, Plus, X, Save } from "lucide-react";

export default function ParkingSlotsPage() {
  const [slots, setSlots] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterZone, setFilterZone] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState<any>({ zone_id: "", slot_number: "", floor: "0", type: "standard" });
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterZone) params.set("zone_id", filterZone);
      if (filterStatus) params.set("status", filterStatus);
      const [sRes, zRes] = await Promise.all([
        fetch(`/api/membership/parking/slots?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/zones", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const sData = await sRes.json();
      const zData = await zRes.json();
      if (Array.isArray(sData)) setSlots(sData);
      if (Array.isArray(zData)) setZones(zData);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterZone, filterStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, zone_id: parseInt(form.zone_id), floor: parseInt(form.floor) }),
      });
      if (res.ok) { setShowForm(false); setForm({ zone_id: "", slot_number: "", floor: "0", type: "standard" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, "success" | "danger" | "warning" | "default"> = { available: "success", occupied: "danger", reserved: "warning", maintenance: "default" };
    return <GemBadge variant={map[s] || "default"}>{s}</GemBadge>;
  };

  return (
    <GemPage>
      <GemHeader
        title="Parking Slots"
        subtitle="View and manage individual parking slots"
        actions={
          <GemBtn onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "Add Slot"}
          </GemBtn>
        }
      />

      <div className="flex gap-2 mb-4">
        <GemSelect value={filterZone} onChange={(e: any) => setFilterZone(e.target.value)} className="w-40">
          <option value="">All Zones</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.code} - {z.name}</option>)}
        </GemSelect>
        <GemSelect value={filterStatus} onChange={(e: any) => setFilterStatus(e.target.value)} className="w-40">
          <option value="">All Status</option>
          <option value="available">Available</option>
          <option value="occupied">Occupied</option>
          <option value="reserved">Reserved</option>
          <option value="maintenance">Maintenance</option>
        </GemSelect>
      </div>

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><LayoutGrid size={18} />Add Parking Slot</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Zone <span className="text-red-500">*</span></label>
              <GemSelect required value={form.zone_id} onChange={(e: any) => setForm({...form, zone_id: e.target.value})}>
                <option value="">Select Zone</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.code} - {z.name}</option>)}
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Slot Number <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.slot_number} onChange={(e: any) => setForm({...form, slot_number: e.target.value})} placeholder="A-01" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Floor</label>
              <GemInput type="number" value={form.floor} onChange={(e: any) => setForm({...form, floor: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Type</label>
              <GemSelect value={form.type} onChange={(e: any) => setForm({...form, type: e.target.value})}>
                <option value="standard">Standard</option>
                <option value="vip">VIP</option>
                <option value="disabled">Disabled</option>
                <option value="reserved">Reserved</option>
                <option value="electric">Electric</option>
                <option value="staff">Staff</option>
              </GemSelect>
            </div>
            <div className="flex items-end">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Add Slot"}
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
        ) : slots.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><LayoutGrid size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No slots found</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Zone", "Slot", "Floor", "Type", "Status"]}
              rows={slots.map(s => [
                <span className="flex items-center gap-2"><GemBadge>{s.zone_code}</GemBadge> {s.zone_name}</span>,
                <span className="font-bold">{s.slot_number}</span>,
                s.floor,
                <GemBadge variant="info">{s.type}</GemBadge>,
                statusBadge(s.status),
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
