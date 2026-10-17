"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemBtnOutline, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { Map, Plus, X, Save, LayoutGrid } from "lucide-react";

export default function ParkingZonesPage() {
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ name: "", code: "", floor: "0", description: "", slot_count: "0", type: "standard" });
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/membership/parking/zones", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setZones(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, floor: parseInt(form.floor), slot_count: parseInt(form.slot_count) }),
      });
      if (res.ok) { setShowForm(false); setForm({ name: "", code: "", floor: "0", description: "", slot_count: "0", type: "standard" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const typeBadge = (t: string) => {
    const map: Record<string, "default" | "warning" | "info" | "success"> = { standard: "default", vip: "warning", disabled: "info", reserved: "default", electric: "success", staff: "default" };
    return <GemBadge variant={map[t] || "default"}>{t}</GemBadge>;
  };

  return (
    <GemPage>
      <GemHeader
        title="Parking Zones & Lots"
        subtitle="Manage parking zones, lots, and slot inventory"
        actions={
          <GemBtn onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "New Zone"}
          </GemBtn>
        }
      />

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Map size={18} />Create Parking Zone</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Zone Name <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.name} onChange={(e: any) => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Code <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.code} onChange={(e: any) => setForm({...form, code: e.target.value})} placeholder="A, B, VIP" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Floor</label>
              <GemInput type="number" value={form.floor} onChange={(e: any) => setForm({...form, floor: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Slots</label>
              <GemInput type="number" value={form.slot_count} onChange={(e: any) => setForm({...form, slot_count: e.target.value})} />
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
            <div className="md:col-span-5">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Description</label>
              <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/30 transition-all" rows={2} value={form.description} onChange={(e: any) => setForm({...form, description: e.target.value})} />
            </div>
            <div className="md:col-span-5">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Create Zone"}
              </GemBtn>
            </div>
          </form>
        </GemCard>
      )}

      <GemCardBare className="mb-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        ) : zones.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><Map size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No zones created yet</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Code", "Name", "Floor", "Type", "Slots", "Occupied", "Available", "Status"]}
              rows={zones.map(z => [
                <span className="font-bold">{z.code}</span>,
                z.name,
                z.floor,
                typeBadge(z.type),
                z.total_slots,
                <span className="font-semibold text-red-500">{z.occupied_slots}</span>,
                <span className="font-semibold text-emerald-600">{z.total_slots - z.occupied_slots}</span>,
                z.is_active ? <GemBadge variant="success">Active</GemBadge> : <GemBadge variant="danger">Inactive</GemBadge>,
              ])}
            />
          </div>
        )}
      </GemCardBare>

      <Link href="/dashboard/membership/parking/slots" className="text-inherit">
        <GemBtnOutline>
          <LayoutGrid size={16} />Manage Slots
        </GemBtnOutline>
      </Link>
    </GemPage>
  );
}
