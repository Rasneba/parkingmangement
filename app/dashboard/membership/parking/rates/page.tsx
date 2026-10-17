"use client";
import { useEffect, useState } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { DollarSign, Plus, X, Save } from "lucide-react";

export default function ParkingRatesPage() {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ name: "", vehicle_type: "all", rate_type: "hourly", base_rate: "0", per_hour_rate: "0", per_day_rate: "0", grace_period_minutes: "15", max_daily_charge: "" });
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/membership/parking/rates", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setRates(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          base_rate: parseFloat(form.base_rate) || 0,
          per_hour_rate: parseFloat(form.per_hour_rate) || 0,
          per_day_rate: parseFloat(form.per_day_rate) || 0,
          grace_period_minutes: parseInt(form.grace_period_minutes) || 15,
          max_daily_charge: form.max_daily_charge ? parseFloat(form.max_daily_charge) : null,
        }),
      });
      if (res.ok) { setShowForm(false); setForm({ name: "", vehicle_type: "all", rate_type: "hourly", base_rate: "0", per_hour_rate: "0", per_day_rate: "0", grace_period_minutes: "15", max_daily_charge: "" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  return (
    <GemPage>
      <GemHeader
        title="Parking Rates"
        subtitle="Configure parking fee structure and pricing"
        actions={
          <GemBtn onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "New Rate"}
          </GemBtn>
        }
      />

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><DollarSign size={18} />Create Rate</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Rate Name <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.name} onChange={(e: any) => setForm({...form, name: e.target.value})} placeholder="Standard Hourly" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Vehicle Type</label>
              <GemSelect value={form.vehicle_type} onChange={(e: any) => setForm({...form, vehicle_type: e.target.value})}>
                <option value="all">All</option>
                <option value="car">Car</option>
                <option value="suv">SUV</option>
                <option value="truck">Truck</option>
                <option value="bus">Bus</option>
                <option value="motorcycle">Motorcycle</option>
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Rate Type</label>
              <GemSelect value={form.rate_type} onChange={(e: any) => setForm({...form, rate_type: e.target.value})}>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="flat">Flat</option>
                <option value="custom">Custom</option>
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Base Rate (ETB)</label>
              <GemInput type="number" value={form.base_rate} onChange={(e: any) => setForm({...form, base_rate: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Per Hour</label>
              <GemInput type="number" value={form.per_hour_rate} onChange={(e: any) => setForm({...form, per_hour_rate: e.target.value})} placeholder="50" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Per Day</label>
              <GemInput type="number" value={form.per_day_rate} onChange={(e: any) => setForm({...form, per_day_rate: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Grace Period (min)</label>
              <GemInput type="number" value={form.grace_period_minutes} onChange={(e: any) => setForm({...form, grace_period_minutes: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Max Daily Charge</label>
              <GemInput type="number" value={form.max_daily_charge} onChange={(e: any) => setForm({...form, max_daily_charge: e.target.value})} />
            </div>
            <div className="md:col-span-4">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Create Rate"}
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
        ) : rates.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><DollarSign size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No rates configured</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Name", "Vehicle Type", "Rate Type", "Base Rate", "Per Hour", "Per Day", "Grace Period", "Max Daily", "Status"]}
              rows={rates.map(r => [
                <span className="font-semibold">{r.name}</span>,
                <GemBadge>{r.vehicle_type}</GemBadge>,
                <GemBadge variant="info">{r.rate_type}</GemBadge>,
                `ETB ${Number(r.base_rate).toLocaleString()}`,
                r.per_hour_rate ? `ETB ${Number(r.per_hour_rate).toLocaleString()}` : "-",
                r.per_day_rate ? `ETB ${Number(r.per_day_rate).toLocaleString()}` : "-",
                `${r.grace_period_minutes} min`,
                r.max_daily_charge ? `ETB ${Number(r.max_daily_charge).toLocaleString()}` : "-",
                r.is_active ? <GemBadge variant="success">Active</GemBadge> : <GemBadge variant="danger">Inactive</GemBadge>,
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
