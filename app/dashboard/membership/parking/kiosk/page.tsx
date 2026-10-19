"use client";
import { useEffect, useState, useRef } from "react";
import { GemPage, GemCard, GemBtn, GemBtnOutline, GemBadge, GemInput, GemSelect, GemAlert } from "@/lib/gem-ui";
import { QrCode, User, UserPlus, DoorOpen, Search, CheckCircle, Printer } from "lucide-react";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "telebirr", label: "Telebirr" },
  { value: "cbebirr", label: "CBE Birr" },
  { value: "chapa", label: "Chapa" },
  { value: "addispay", label: "AddisPay" },
  { value: "bank", label: "Bank transfer" },
  { value: "pos", label: "POS terminal" },
  { value: "credit_card", label: "Credit card" },
  { value: "debit_card", label: "Debit card" },
];

const money = (amount: number | string, currency = "ETB") => `${Number(amount || 0).toFixed(2)} ${currency}`;

export default function KioskPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [mode, setMode] = useState<"entry" | "exit">("entry");
  const [doorMsg, setDoorMsg] = useState("");

  // ---- entry state ----
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

  // ---- exit state ----
  const [exitQuery, setExitQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState<any>(null);
  const [matches, setMatches] = useState<any[] | null>(null);
  const [method, setMethod] = useState("cash");
  const [exitLoading, setExitLoading] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [exitError, setExitError] = useState("");
  const idemKey = useRef<string>("");

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

  const openDoorRelay = async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/parking/access/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "open" }),
      });
      const d = await r.json();
      setDoorMsg(d.success ? "Barrier open command sent" : "Barrier command failed");
    } catch {
      setDoorMsg("Barrier command sent");
    }
    setTimeout(() => setDoorMsg(""), 6000);
  };

  // ------------------------------- entry -------------------------------
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
      if (res.ok) { setResult(data); openDoorRelay(); }
      else setError(data.error || "Failed to create entry");
    } catch { setError("Server error"); }
    setLoading(false);
  };

  // -------------------------------- exit --------------------------------
  const doExitLookup = async (term: string) => {
    const needle = term.trim();
    if (!needle || !token) return;
    setLooking(true); setExitError(""); setLookup(null); setMatches(null);
    try {
      const r = await fetch(`/api/membership/parking/sessions/exit?q=${encodeURIComponent(needle)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) setExitError(d.error || "Lookup failed");
      else if (d.matches) setMatches(d.matches);
      else if (d.session) { setLookup(d); idemKey.current = crypto.randomUUID(); }
    } catch { setExitError("Server error"); }
    setLooking(false);
  };

  const settle = async () => {
    if (!lookup?.session || !token) return;
    setExitLoading(true); setExitError("");
    try {
      const r = await fetch("/api/membership/parking/sessions/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          session_id: lookup.session.id,
          payment_method: method,
          idempotency_key: idemKey.current,
        }),
      });
      const d = await r.json();
      if (r.ok) { setReceipt(d); setLookup(null); setExitQuery(""); openDoorRelay(); }
      else setExitError(d.error || "Exit failed");
    } catch { setExitError("Server error"); }
    setExitLoading(false);
  };

  const reset = () => {
    setResult(null); setReceipt(null); setSelectedCustomer(null); setSelectedZone(null); setCustomerSearch("");
    setWalkInName(""); setWalkInPhone(""); setIsWalkIn(false); setError("");
    setLookup(null); setMatches(null); setExitQuery(""); setExitError("");
  };

  // ------------------------------ outcomes ------------------------------
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
        {doorMsg && <GemAlert type="success"><DoorOpen size={14} className="inline mr-1" />{doorMsg}</GemAlert>}
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

  if (receipt) {
    const p = receipt.pricing || {};
    return (
      <GemPage>
        <style>{`@media print{body *{visibility:hidden}#rcpt,#rcpt *{visibility:visible}#rcpt{position:absolute;left:0;top:0;width:100%;text-align:center;padding:20px}}`}</style>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Exit Complete</h1>
          <div className="flex gap-2">
            <GemBtnOutline onClick={() => window.print()}>Print Receipt</GemBtnOutline>
            <GemBtn onClick={reset}>New Transaction</GemBtn>
          </div>
        </div>
        {doorMsg && <GemAlert type="success"><DoorOpen size={14} className="inline mr-1" />{doorMsg}</GemAlert>}
        <div id="rcpt" className="bg-white rounded-3xl shadow-sm text-center py-12 px-6 max-w-lg mx-auto">
          <GemBadge variant="success" className="text-lg px-4 py-2 mb-4">PAID — CHECKED OUT</GemBadge>
          <h2 className="text-2xl font-bold mb-1">{receipt.session?.plate_number || receipt.session?.ticket_number}</h2>
          <p className="text-gray-500 mb-4">Ticket {receipt.session?.ticket_number}</p>
          <div className="text-4xl font-bold text-emerald-600 mb-2">{money(receipt.payment?.amount, p.currency)}</div>
          <p className="text-sm text-gray-400 mb-6">Receipt {receipt.payment?.receipt_number} · {receipt.payment?.payment_method}</p>
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <p className="text-xs text-gray-400">Duration</p>
              <p className="font-bold">{Math.round(p.fee?.durationMinutes || 0)} min</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Exit Time</p>
              <p className="font-bold">{new Date(receipt.session?.exit_time).toLocaleTimeString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Space</p>
              <p className="font-bold">{receipt.slot_released ? "Released" : "—"}</p>
            </div>
          </div>
        </div>
      </GemPage>
    );
  }

  // -------------------------------- form --------------------------------
  return (
    <GemPage>
      <div style={{ maxWidth: 540, margin: "0 auto" }}>
        <div className="text-center mb-5">
          <div className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center mx-auto mb-3">
            <QrCode size={32} />
          </div>
          <h2 className="text-2xl font-bold">Parking Kiosk</h2>
          <p className="text-sm text-gray-500">Self-service entry &amp; exit terminal</p>
        </div>

        <div className="flex mb-4">
          <button
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${mode === "entry" ? "bg-black text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            onClick={() => setMode("entry")}
          >
            <ArrowDownIcon /> Entry
          </button>
          <button
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ml-2 ${mode === "exit" ? "bg-black text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            onClick={() => setMode("exit")}
          >
            <ArrowUpIcon /> Exit
          </button>
        </div>

        {doorMsg && <GemAlert type="success"><DoorOpen size={14} className="inline mr-1" />{doorMsg}</GemAlert>}

        {mode === "entry" ? (
          <>
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
                    <GemInput placeholder="e.g. John Doe" value={walkInName} onChange={e => setWalkInName(e.target.value)} />
                  </div>
                  <div className="mb-4">
                    <label className="text-sm text-gray-500 font-medium mb-1 block">Phone (optional)</label>
                    <GemInput placeholder="e.g. +251911..." value={walkInPhone} onChange={e => setWalkInPhone(e.target.value)} />
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
                    <div className="absolute mt-1 border border-gray-200 rounded-xl shadow-lg z-50 w-full max-h-48 overflow-y-auto bg-white">
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
                {loading ? "Processing..." : "Generate Entry QR & Open Barrier"}
              </button>
            </GemCard>
          </>
        ) : (
          <>
            {exitError && <GemAlert type="danger">{exitError}</GemAlert>}
            <GemCard>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Ticket number or plate</label>
              <div className="flex gap-2 mb-4">
                <GemInput
                  autoFocus
                  placeholder="e.g. SES-000012 or ABC-123"
                  value={exitQuery}
                  onChange={e => setExitQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doExitLookup(exitQuery)}
                />
                <GemBtn onClick={() => doExitLookup(exitQuery)} className={looking ? "opacity-60 pointer-events-none" : ""}>
                  <Search size={16} className="inline mr-1" />{looking ? "..." : "Find"}
                </GemBtn>
              </div>

              {matches && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">Multiple matches — select one:</p>
                  {matches.map(m => (
                    <button key={m.id} onClick={() => { setMatches(null); setExitQuery(m.ticket_number); doExitLookup(m.ticket_number); }}
                      className="w-full text-left px-3 py-2 rounded-xl border border-gray-100 hover:bg-gray-50 mb-2">
                      <span className="font-mono text-sm">{m.ticket_number}</span>
                      <span className="text-xs text-gray-400 ml-2">{m.plate_number} · {m.status}</span>
                    </button>
                  ))}
                </div>
              )}

              {lookup?.session && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="font-semibold">{lookup.session.plate_number}</p>
                      <p className="text-xs text-gray-400">Ticket {lookup.session.ticket_number}</p>
                    </div>
                    <GemBadge variant="info">{lookup.pricing?.fee?.durationMinutes ? `${lookup.pricing.fee.durationMinutes} min` : "—"}</GemBadge>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 mb-4">
                    {(lookup.pricing?.fee?.breakdown || []).map((b: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>{b.label}</span>
                        <span>{money(b.amount, lookup.pricing?.currency)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 mt-1">
                      <span>Amount due</span>
                      <span>{money(lookup.pricing?.amountDue, lookup.pricing?.currency)}</span>
                    </div>
                    {lookup.pricing?.covered && (
                      <p className="text-xs text-emerald-600 mt-1">Covered by {lookup.pricing.covered.label}</p>
                    )}
                  </div>

                  <label className="text-sm text-gray-500 font-medium mb-1 block">Payment method</label>
                  <GemSelect value={method} onChange={e => setMethod(e.target.value)}>
                    {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </GemSelect>

                  <button
                    className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg mt-4 transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
                    onClick={settle}
                    disabled={exitLoading}
                  >
                    <CheckCircle size={18} className="inline mr-1" />{exitLoading ? "Processing..." : "Confirm Payment & Open Barrier"}
                  </button>
                </div>
              )}
            </GemCard>
          </>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          <Printer size={12} className="inline mr-1" />Entry &amp; exit are logged system-wide and the barrier opens automatically.
        </p>
      </div>
    </GemPage>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
