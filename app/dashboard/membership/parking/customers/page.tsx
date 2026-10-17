"use client";
import { useEffect, useState, useRef } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemTable, GemBadge, GemInput } from "@/lib/gem-ui";
import { UserPlus, Plus, X, Save, QrCode } from "lucide-react";

export default function ParkingCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [nextId, setNextId] = useState("");
  const [form, setForm] = useState<any>({ customer_id: "", full_name: "", phone: "", email: "", id_number: "", address: "", photo_url: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const res = await fetch(`/api/membership/parking/customers?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setCustomers(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [search]);

  useEffect(() => {
    if (!showForm) return;
    (async () => {
      try {
        const res = await fetch("/api/membership/parking/customers/next-id", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const data = await res.json(); setNextId(data.id); setForm((f: any) => ({ ...f, customer_id: data.id })); }
      } catch {}
    })();
  }, [showForm]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhotoPreview(dataUrl);
      setForm({ ...form, photo_url: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) { setShowForm(false); setPhotoPreview(""); setNextId(""); setForm({ customer_id: "", full_name: "", phone: "", email: "", id_number: "", address: "", photo_url: "", notes: "" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  return (
    <GemPage>
      <GemHeader
        title="Customer Registration"
        subtitle="Register and manage customer profiles"
        actions={
          <GemBtn onClick={() => setShowForm(!showForm)}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "Register Customer"}
          </GemBtn>
        }
      />

      <div className="mb-4 max-w-sm">
        <GemInput placeholder="Search name, phone, ID..." value={search} onChange={(e: any) => setSearch(e.target.value)} />
      </div>

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><UserPlus size={18} />New Customer Registration</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Customer ID <span className="text-red-500">*</span></label>
              <GemInput type="text" required disabled value={form.customer_id} placeholder="Auto-generated" className="bg-gray-50" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Full Name <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.full_name} onChange={(e: any) => setForm({...form, full_name: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Phone <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.phone} onChange={(e: any) => setForm({...form, phone: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Email</label>
              <GemInput type="email" value={form.email} onChange={(e: any) => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">ID Number</label>
              <GemInput type="text" value={form.id_number} onChange={(e: any) => setForm({...form, id_number: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Address</label>
              <GemInput type="text" value={form.address} onChange={(e: any) => setForm({...form, address: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Photo</label>
              <div className="flex items-center gap-3">
                <input type="file" ref={fileInputRef} className="text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition-all" accept="image/*" onChange={handlePhotoChange} />
                {photoPreview && (
                  <img src={photoPreview} alt="Preview" loading="lazy" className="rounded-full border border-gray-200" style={{ width: 48, height: 48, objectFit: "cover" }} />
                )}
              </div>
            </div>
            <div className="md:col-span-4">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Notes</label>
              <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/30 transition-all" rows={2} value={form.notes} onChange={(e: any) => setForm({...form, notes: e.target.value})} />
            </div>
            <div className="md:col-span-4 flex items-center gap-4">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Register Customer"}
              </GemBtn>
              <span className="text-xs text-gray-400">QR code and Customer ID generated automatically</span>
            </div>
          </form>
        </GemCard>
      )}

      <GemCardBare>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><UserPlus size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No customers registered</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Customer ID", "Full Name", "Phone", "Email", "ID Number", "Status", "QR Code"]}
              rows={customers.map(c => [
                <span className="font-bold text-sm">{c.customer_id}</span>,
                c.full_name,
                c.phone,
                <span className="text-sm text-gray-400">{c.email || "-"}</span>,
                <span className="text-sm text-gray-400">{c.id_number || "-"}</span>,
                c.status === 'active' ? <GemBadge variant="success">Active</GemBadge> : <GemBadge variant="danger">Inactive</GemBadge>,
                <button className="text-blue-600 hover:text-blue-800 transition-colors" onClick={() => { navigator.clipboard?.writeText(c.qr_code || ""); alert("QR code copied to clipboard"); }}>
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
