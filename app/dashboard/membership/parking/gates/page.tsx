"use client";
import { useEffect, useState } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { DoorOpen, Plus, X, Save } from "lucide-react";

export default function ParkingGatesPage() {
  const [gates, setGates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ name: "", code: "", type: "entry", direction: "in", ip_address: "", port: "80", barrier_open_delay: "2", is_anpr_enabled: true, is_qr_enabled: true, is_nfc_enabled: false, is_rfid_enabled: false, notes: "" });
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/membership/parking/gates", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setGates(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/gates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, port: parseInt(form.port) || 80, barrier_open_delay: parseInt(form.barrier_open_delay) || 2 }),
      });
      if (res.ok) { setShowForm(false); setForm({ name: "", code: "", type: "entry", direction: "in", ip_address: "", port: "80", barrier_open_delay: "2", is_anpr_enabled: true, is_qr_enabled: true, is_nfc_enabled: false, is_rfid_enabled: false, notes: "" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const toggleGate = async (id: number, field: string, value: any) => {
    if (!token) return;
    try {
      await fetch(`/api/membership/parking/gates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: value }),
      });
      load();
    } catch {}
  };

  const statusBadge = (s: string) => {
    const map: Record<string, "success" | "default" | "warning"> = { active: "success", inactive: "default", maintenance: "warning" };
    return <GemBadge variant={map[s] || "default"}>{s}</GemBadge>;
  };

  return (
    <GemPage>
      <GemHeader
        title="Parking Gates"
        subtitle="Configure 3 entry/exit gates with ANPR, QR, and NFC"
        actions={
          <GemBtn onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "Add Gate"}
          </GemBtn>
        }
      />

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><DoorOpen size={18} />Register Gate</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Gate Name <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.name} onChange={(e: any) => setForm({...form, name: e.target.value})} placeholder="Gate 1" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Code <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.code} onChange={(e: any) => setForm({...form, code: e.target.value})} placeholder="G1" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Type</label>
              <GemSelect value={form.type} onChange={(e: any) => setForm({...form, type: e.target.value})}>
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
                <option value="dual">Dual (Entry/Exit)</option>
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Direction</label>
              <GemSelect value={form.direction} onChange={(e: any) => setForm({...form, direction: e.target.value})}>
                <option value="in">In</option>
                <option value="out">Out</option>
                <option value="both">Both</option>
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Barrier Delay (s)</label>
              <GemInput type="number" value={form.barrier_open_delay} onChange={(e: any) => setForm({...form, barrier_open_delay: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-500 font-medium mb-1 block">IP Address</label>
              <GemInput type="text" value={form.ip_address} onChange={(e: any) => setForm({...form, ip_address: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Port</label>
              <GemInput type="number" value={form.port} onChange={(e: any) => setForm({...form, port: e.target.value})} />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm text-gray-500 font-medium mb-2 block">Features</label>
              <div className="flex gap-4">
                {[{ key: "is_anpr_enabled", label: "ANPR" }, { key: "is_qr_enabled", label: "QR" }, { key: "is_nfc_enabled", label: "NFC" }, { key: "is_rfid_enabled", label: "RFID" }].map(f => (
                  <label key={f.key} className="flex items-center gap-1.5 text-sm text-gray-600">
                    <input type="checkbox" checked={form[f.key]} onChange={(e: any) => setForm({...form, [f.key]: e.target.checked})} className="rounded border-gray-300" />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-6">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Notes</label>
              <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/30 transition-all" rows={2} value={form.notes} onChange={(e: any) => setForm({...form, notes: e.target.value})} />
            </div>
            <div className="md:col-span-6">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Add Gate"}
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
        ) : gates.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><DoorOpen size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No gates configured</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Code", "Name", "Type", "Direction", "Cameras", "Features", "Status", "Actions"]}
              rows={gates.map(g => [
                <span className="font-bold">{g.code}</span>,
                g.name,
                <GemBadge>{g.type}</GemBadge>,
                <GemBadge variant="info">{g.direction}</GemBadge>,
                g.camera_count,
                <div className="flex gap-1 flex-wrap">
                  {g.is_anpr_enabled && <GemBadge variant="info">ANPR</GemBadge>}
                  {g.is_qr_enabled && <GemBadge variant="success">QR</GemBadge>}
                  {g.is_nfc_enabled && <GemBadge variant="warning">NFC</GemBadge>}
                  {g.is_rfid_enabled && <GemBadge>RFID</GemBadge>}
                </div>,
                statusBadge(g.status),
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={g.status === "active"} onChange={e => toggleGate(g.id, "status", e.target.checked ? "active" : "inactive")} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-black/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
                </label>,
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
