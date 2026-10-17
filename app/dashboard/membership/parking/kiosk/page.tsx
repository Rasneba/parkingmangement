"use client";
import { useEffect, useState, useRef } from "react";
import { GemPage, GemCard, GemBtn, GemBtnOutline, GemBadge, GemInput, GemSelect, GemAlert } from "@/lib/gem-ui";
import { QrCode, User, UserPlus } from "lucide-react";

export default function KioskPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const customerRef = useRef<HTMLDivElement>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!token) return;
    fetch("/api/membership/parking/customers", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setCustomers(d); }).catch(() => {});
    fetch("/api/membership/parking/zones", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setZones(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCustomers = customers.filter(c =>
    !customerSearch || c.full_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch) || c.customer_id?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const handleEntry = async () => {
    if (!token) return;
    if (!isWalkIn && !selectedCustomer) { setError("Select a customer or switch to walk-in"); return; }
    if (isWalkIn && !walkInName.trim()) { setError("Enter walk-in name"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const body: any = { zone_id: selectedZone?.id || null };
      if (isWalkIn) { body.full_name = walkInName.trim(); body.phone = walkInPhone.trim(); }
      else body.customer_id = selectedCustomer!.id;
      const res = await fetch("/api/membership/parking/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) setResult(data);
      else setError(data.error || "Failed to create entry");
    } catch { setError("Server error"); }
    setLoading(false);
  };

  const reset = () => {
    setResult(null); setSelectedCustomer(null); setSelectedZone(null); setCustomerSearch("");
    setWalkInName(""); setWalkInPhone(""); setIsWalkIn(false); setError("");
  };

  if (result) {
    return (
      <GemPage>
        <style>{`@media print{body *{visibility:hidden}#qr-print,#qr-print *{visibility:visible}#qr-print{position:absolute;left:0;top:0;width:100%;text-align:center;padding:20px}}`}</style>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Entry Complete</h1>
          <div className="flex gap-2">
            <GemBtnOutline onClick={() => window.print()}>Print</GemBtnOutline>
            <GemBtn onClick={reset}>New Entry</GemBtn>
          </div>
        </div>
        <div id="qr-print" className="bg-white rounded-3xl shadow-sm text-center py-12 px-6 max-w-lg mx-auto">
          <GemBadge variant="success" className="text-lg px-4 py-2 mb-4">CHECKED IN</GemBadge>
          <h2 className="text-2xl font-bold mb-1">{result.customer.full_name}</h2>
          {result.customer.phone && <p className="text-gray-500 mb-4">{result.customer.phone}</p>}
          <div className="inline-block border border-gray-200 rounded-2xl p-4 mb-4">
            <img src={result.qr_ticket.qr_data_url} alt="QR Code" loading="lazy" style={{ width: 220, height: 220 }} />
          </div>
          <div className="mb-4">
            <div className="text-3xl font-bold text-blue-600">{result.qr_ticket.ticket_number}</div>
            <p className="text-sm text-gray-400">Show this QR at the gate for entry</p>
          </div>
          <div className="flex justify-center gap-8 mt-4">
            <div className="text-center">
              <p className="text-xs text-gray-400">Session</p>
              <p className="font-bold">{result.session.ticket_number}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Entry Time</p>
              <p className="font-bold">{new Date(result.session.entry_time).toLocaleTimeString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Date</p>
              <p className="font-bold">{new Date(result.session.entry_time).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </GemPage>
    );
  }

  return (
    <GemPage>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center mx-auto mb-3">
            <QrCode size={32} />
          </div>
          <h2 className="text-2xl font-bold">Parking Entry Kiosk</h2>
          <p className="text-sm text-gray-500">Generate entry QR code for customers</p>
        </div>

        {error && <GemAlert type="danger">{error}</GemAlert>}

        <GemCard>
          <div className="flex mb-4">
            <button className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${!isWalkIn ? "bg-black text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`} onClick={() => setIsWalkIn(false)}>
              <User size={16} className="inline mr-1" />Registered
            </button>
            <button className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ml-2 ${isWalkIn ? "bg-black text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`} onClick={() => setIsWalkIn(true)}>
              <UserPlus size={16} className="inline mr-1" />Walk-in
            </button>
          </div>

          {isWalkIn ? (
            <>
              <div className="mb-3">
                <label className="text-sm text-gray-500 font-medium mb-1 block">Full Name <span className="text-red-500">*</span></label>
                <GemInput placeholder="e.g. John Doe" value={walkInName} onChange={e => setWalkInName(e.target.value)} onKeyDown={e => e.key === "Enter" && document.getElementById("kiosk-phone")?.focus()} />
              </div>
              <div className="mb-4">
                <label className="text-sm text-gray-500 font-medium mb-1 block">Phone (optional)</label>
                <GemInput id="kiosk-phone" placeholder="e.g. +251911..." value={walkInPhone} onChange={e => setWalkInPhone(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="mb-4 relative" ref={customerRef}>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Customer <span className="text-red-500">*</span></label>
              <GemInput
                placeholder="Search customer by name, phone or ID..."
                value={selectedCustomer ? `${selectedCustomer.full_name} (${selectedCustomer.customer_id || selectedCustomer.id})` : customerSearch}
                onChange={e => { setSelectedCustomer(null); setCustomerSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                className={selectedCustomer ? "border-green-500" : ""}
              />
              {showDropdown && (
                <div className="absolute mt-1 border border-gray-200 rounded-xl shadow-lg z-50 w-full max-h-48 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400">No customers found</div>
                  ) : filteredCustomers.slice(0, 20).map(c => (
                    <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(`${c.full_name} (${c.customer_id || c.id})`); setShowDropdown(false); }}>
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">{c.full_name}</span>
                        <span className="text-xs text-gray-400">{c.phone}</span>
                      </div>
                      <p className="text-xs text-gray-400">{c.customer_id || `ID: ${c.id}`}{c.id_number ? ` | ${c.id_number}` : ""}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm text-gray-500 font-medium mb-1 block">Parking Zone</label>
            <GemSelect value={selectedZone?.id || ""} onChange={e => {
              const zone = zones.find(z => z.id === parseInt(e.target.value));
              setSelectedZone(zone || null);
            }}>
              <option value="">-- Any Available Slot --</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>{z.name} ({z.code}) &mdash; {z.occupied_slots || 0}/{z.total_slots || 0} filled</option>
              ))}
            </GemSelect>
          </div>

          <button
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
            onClick={handleEntry}
            disabled={loading || (!isWalkIn && !selectedCustomer) || (isWalkIn && !walkInName.trim())}
          >
            {loading ? "Processing..." : "Generate Entry QR"}
          </button>
        </GemCard>
      </div>
    </GemPage>
  );
}
