"use client";
import { useEffect, useState } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemBtnOutline, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { CreditCard, Plus, X, Search, Trash2, Save } from "lucide-react";

export default function RfidCardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any>({ card_uid: "", member_id: "", label: "", status: "active" });
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const [cardRes, subRes] = await Promise.all([
        fetch(`/api/membership/parking/rfid-cards?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/subscriptions", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cardData = await cardRes.json();
      const subData = await subRes.json();
      const subs = Array.isArray(subData) ? subData : subData.data || [];
      const today = new Date().toISOString().split("T")[0];
      const enriched = (Array.isArray(cardData) ? cardData : cardData.data || []).map((c: any) => {
        const sub = subs.find((s: any) =>
          s.customer_id === c.member_id &&
          ["active", "pending"].includes(s.status) &&
          s.start_date <= today &&
          s.end_date >= today
        );
        return { ...c, days_remaining: sub ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000)) : 0 };
      });
      setCards(enriched);
    } catch {}
    setLoading(false);
  };

  const loadMembers = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/membership/parking/customers", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setMembers(data);
    } catch {}
  };

  useEffect(() => { load(); }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/rfid-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, member_id: form.member_id ? parseInt(form.member_id) : null }),
      });
      if (res.ok) { setShowForm(false); setForm({ card_uid: "", member_id: "", label: "", status: "active" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const deleteCard = async (id: number) => {
    if (!token || !confirm("Delete this RFID card?")) return;
    try {
      const res = await fetch(`/api/membership/parking/rfid-cards/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) load();
    } catch {}
  };

  const statusBadge = (s: string) => {
    const map: Record<string, "success" | "default" | "danger"> = { active: "success", disabled: "default", lost: "danger" };
    return <GemBadge variant={map[s] || "default"}>{s}</GemBadge>;
  };

  return (
    <GemPage>
      <GemHeader
        title="RFID Cards"
        subtitle="Register and manage RFID cards for access control"
        actions={
          <GemBtn onClick={() => { setShowForm(!showForm); if (!showForm) loadMembers(); }}>
            {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "Register Card"}
          </GemBtn>
        }
      />

      <div className="mb-4 max-w-sm">
        <GemInput placeholder="Search card UID, label, or member..." value={search} onChange={(e: any) => setSearch(e.target.value)} />
      </div>

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><CreditCard size={18} />Register RFID Card</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Card UID <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.card_uid} onChange={(e: any) => setForm({...form, card_uid: e.target.value})} placeholder="RFID tag serial number" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Label</label>
              <GemInput type="text" value={form.label} onChange={(e: any) => setForm({...form, label: e.target.value})} placeholder="e.g. Main Gate Card #1" />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Member</label>
              <GemSelect value={form.member_id} onChange={(e: any) => setForm({...form, member_id: e.target.value})}>
                <option value="">-- Unassigned --</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.customer_id || `MEM-${m.id}`} — {m.full_name} {m.phone ? `(${m.phone})` : ""}</option>
                ))}
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Status</label>
              <GemSelect value={form.status} onChange={(e: any) => setForm({...form, status: e.target.value})}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="lost">Lost</option>
              </GemSelect>
            </div>
            <div className="md:col-span-4">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Register Card"}
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
        ) : cards.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><CreditCard size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No RFID cards registered</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Card UID", "Label", "Member", "Status", "Days Left", "Last Used", "Actions"]}
              rows={cards.map(c => [
                <span className="font-bold font-mono text-sm">{c.card_uid}</span>,
                <span className="text-sm text-gray-500">{c.label || "-"}</span>,
                c.member_name
                  ? <span className="text-sm">{c.member_code || `MEM-${c.member_id}`} — {c.member_name}</span>
                  : <span className="text-sm text-gray-400">Unassigned</span>,
                statusBadge(c.status),
                c.days_remaining > 0
                  ? <span className={`font-bold text-sm ${c.days_remaining <= 5 ? "text-red-500" : "text-emerald-600"}`}>{c.days_remaining}d</span>
                  : <span className="text-gray-400 text-sm">-</span>,
                <span className="text-sm text-gray-400">{c.last_used_at ? new Date(c.last_used_at).toLocaleString() : "Never"}</span>,
                <button className="text-red-500 hover:text-red-700 transition-colors" onClick={() => deleteCard(c.id)}>
                  <Trash2 size={16} />
                </button>,
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
