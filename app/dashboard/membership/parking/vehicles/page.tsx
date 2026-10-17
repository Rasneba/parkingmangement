"use client";
import { useEffect, useState } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { Car, Plus, X, Save } from "lucide-react";

export default function ParkingVehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any>({ plate_number: "", vehicle_type: "car", vehicle_model: "", vehicle_color: "", owner_name: "", owner_phone: "", owner_email: "", rfid_tag: "", nfc_tag: "", is_resident: false, notes: "" });
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("plate", search);
      const res = await fetch(`/api/membership/parking/vehicles?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setVehicles(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) { setShowForm(false); setForm({ plate_number: "", vehicle_type: "car", vehicle_model: "", vehicle_color: "", owner_name: "", owner_phone: "", owner_email: "", rfid_tag: "", nfc_tag: "", is_resident: false, notes: "" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  return (
    <GemPage>
      <GemHeader
        title="Registered Vehicles"
        subtitle="Vehicle database with plate recognition and blacklist"
        actions={
          <GemBtn onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "Register Vehicle"}
          </GemBtn>
        }
      />

      <div className="mb-4 max-w-sm">
        <GemInput placeholder="Search plate..." value={search} onChange={(e: any) => setSearch(e.target.value)} />
      </div>

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Car size={18} />Register Vehicle</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Plate Number <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.plate_number} onChange={(e: any) => setForm({...form, plate_number: e.target.value})} placeholder="AA-1234" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Type</label>
              <GemSelect value={form.vehicle_type} onChange={(e: any) => setForm({...form, vehicle_type: e.target.value})}>
                <option value="car">Car</option>
                <option value="suv">SUV</option>
                <option value="truck">Truck</option>
                <option value="bus">Bus</option>
                <option value="motorcycle">Motorcycle</option>
                <option value="other">Other</option>
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Model</label>
              <GemInput type="text" value={form.vehicle_model} onChange={(e: any) => setForm({...form, vehicle_model: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Color</label>
              <GemInput type="text" value={form.vehicle_color} onChange={(e: any) => setForm({...form, vehicle_color: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Owner Name</label>
              <GemInput type="text" value={form.owner_name} onChange={(e: any) => setForm({...form, owner_name: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Phone</label>
              <GemInput type="text" value={form.owner_phone} onChange={(e: any) => setForm({...form, owner_phone: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Email</label>
              <GemInput type="email" value={form.owner_email} onChange={(e: any) => setForm({...form, owner_email: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">RFID Tag</label>
              <GemInput type="text" value={form.rfid_tag} onChange={(e: any) => setForm({...form, rfid_tag: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">NFC Tag</label>
              <GemInput type="text" value={form.nfc_tag} onChange={(e: any) => setForm({...form, nfc_tag: e.target.value})} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" checked={form.is_resident} onChange={(e: any) => setForm({...form, is_resident: e.target.checked})} id="resident" className="rounded border-gray-300" />
              <label className="text-sm text-gray-500" htmlFor="resident">Resident (monthly pass)</label>
            </div>
            <div className="md:col-span-3">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Notes</label>
              <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/30 transition-all" rows={2} value={form.notes} onChange={(e: any) => setForm({...form, notes: e.target.value})} />
            </div>
            <div className="md:col-span-4">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Register Vehicle"}
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
        ) : vehicles.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><Car size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No vehicles registered</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Plate", "Type", "Model", "Color", "Owner", "Phone", "RFID/NFC", "Sessions", "Status"]}
              rows={vehicles.map(v => [
                <span className="font-bold">{v.plate_number}</span>,
                <GemBadge>{v.vehicle_type}</GemBadge>,
                <span className="text-sm text-gray-400">{v.vehicle_color || "-"}</span>,
                <span className="text-sm text-gray-400">{v.vehicle_model || "-"}</span>,
                v.owner_name || "-",
                <span className="text-sm">{v.owner_phone || "-"}</span>,
                <span className="text-sm text-gray-400">{v.rfid_tag || v.nfc_tag || "-"}</span>,
                <GemBadge>{v.session_count}</GemBadge>,
                v.is_blacklisted ? <GemBadge variant="danger">Blacklisted</GemBadge> : v.is_resident ? <GemBadge variant="success">Resident</GemBadge> : <GemBadge variant="info">Guest</GemBadge>,
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
