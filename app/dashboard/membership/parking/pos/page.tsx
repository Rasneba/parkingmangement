"use client";
import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemBtnOutline, GemBadge, GemInput, GemSelect, GemAlert } from "@/lib/gem-ui";
import { Monitor, Search, Phone, QrCode, Camera, ShoppingCart, CheckCircle, X } from "lucide-react";

export default function ParkingPosPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-black/20 border-t-black rounded-full animate-spin" /></div>}>
      <ParkingPosContent />
    </Suspense>
  );
}

function ParkingPosContent() {
  const searchParams = useSearchParams();
  const preSessionId = searchParams.get("session");

  const [sessions, setSessions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [plateSearch, setPlateSearch] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [qrSession, setQrSession] = useState<any>(null);
  const [qrLookupLoading, setQrLookupLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState<any>({ session_id: "", amount: "", payment_method: "cash", reference: "", pos_terminal_id: "POS-01", receipt_number: "", paid_by: "", notes: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [chapaLoading, setChapaLoading] = useState(false);
  const [chapaUrl, setChapaUrl] = useState("");
  const [addispayLoading, setAddispayLoading] = useState(false);
  const [addispayUrl, setAddispayUrl] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("checkout");
  const [company, setCompany] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [qrDetected, setQrDetected] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanTimerRef = useRef<any>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const currentUser = token ? (() => { try { return JSON.parse(atob(token.split(".")[1])); } catch { return null; }})() : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [activeRes, payRes, ratesRes, zonesRes, camRes, compRes] = await Promise.all([
        fetch("/api/membership/parking/sessions?status=active,pending_payment", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/payments", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/rates", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/zones", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/cameras", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/companies", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const activeData = await activeRes.json();
      const payData = await payRes.json();
      const ratesData = await ratesRes.json();
      const zonesData = await zonesRes.json();
      const camData = await camRes.json();
      const compData = await compRes.json();
      if (Array.isArray(activeData)) setSessions(activeData);
      if (Array.isArray(payData)) setPayments(payData);
      if (Array.isArray(ratesData)) setRates(ratesData);
      if (Array.isArray(zonesData)) setZones(zonesData);
      if (Array.isArray(camData)) setCameras(camData);
      if (Array.isArray(compData) && compData.length > 0) setCompany(compData[0]);
      if (preSessionId) {
        const found = activeData.find((s: any) => s.id === parseInt(preSessionId));
        if (found) selectSession(found);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [preSessionId]);
  useEffect(() => { return () => { stopCamera(); }; }, []);

  const filteredSessions = sessions.filter(s => {
    if (zoneFilter && s.zone_id !== parseInt(zoneFilter)) return false;
    return true;
  });

  const calculateFee = (session: any) => {
    if (!session.entry_time) return 0;
    const entry = new Date(session.entry_time);
    const exit = session.exit_time ? new Date(session.exit_time) : new Date();
    const diffMs = exit.getTime() - entry.getTime();
    const diffMin = Math.round(diffMs / 60000);
    const diffHours = Math.ceil(diffMin / 60);
    const activeRate = rates.find(r => r.is_active && (r.vehicle_type === "all" || r.vehicle_type === session.vehicle_type));
    if (activeRate) {
      const hourly = Number(activeRate.per_hour_rate) || 30;
      const base = Number(activeRate.base_rate) || 0;
      const grace = activeRate.grace_period_minutes || 0;
      if (grace > 0 && diffMin <= grace) return 0;
      const charge = base + (diffHours * hourly);
      const maxDaily = activeRate.max_daily_charge ? Number(activeRate.max_daily_charge) : null;
      if (maxDaily && charge > maxDaily) return maxDaily;
      return charge;
    }
    const blocks = Math.ceil(diffMin / 30);
    return blocks * 30;
  };

  const selectSession = (session: any) => {
    setSelectedSession(session);
    const fee = calculateFee(session);
    setPaymentForm({ ...paymentForm, session_id: session.id, amount: fee.toString(), receipt_number: `RCP-${session.ticket_number || Date.now()}`, paid_by: session.customer_name || session.visitor_name || session.owner_name || "", phone: session.customer_phone || session.owner_phone || session.visitor_phone || "" });
    setTab("checkout");
  };

  const searchByPlate = async () => {
    if (!token || !plateSearch.trim()) return;
    try {
      const res = await fetch(`/api/membership/parking/sessions?status=pending_payment`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) {
        const found = data.filter((s: any) => (s.plate_number || s.vehicle_plate || "").toLowerCase().includes(plateSearch.toLowerCase()));
        if (found.length > 0) selectSession(found[0]);
        else setMessage("No pending payment session found for this plate");
      }
    } catch {}
  };

  const searchByPhone = async () => {
    if (!token || !phoneSearch.trim()) return;
    try {
      const res = await fetch(`/api/membership/parking/sessions?phone=${encodeURIComponent(phoneSearch.trim())}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const session = data.find((s: any) => !s.paid) || data[0];
        selectSession(session);
      } else setMessage("No pending session found for this phone number");
    } catch {}
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/membership/parking/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...paymentForm, session_id: parseInt(paymentForm.session_id), amount: parseFloat(paymentForm.amount) }),
      });
      if (res.ok) {
        const payResult = await res.json();
        setMessage("Payment successful!");
        const durationMin = selectedSession.exit_time
          ? Math.round((new Date(selectedSession.exit_time).getTime() - new Date(selectedSession.entry_time).getTime()) / 60000)
          : Math.round((Date.now() - new Date(selectedSession.entry_time).getTime()) / 60000);
        setReceipt({
          company, receipt_no: payResult.reference || paymentForm.receipt_number, date: new Date(), cashier: currentUser?.name || "Cashier",
          customer: paymentForm.paid_by || selectedSession.visitor_name || selectedSession.customer_name || "Walk-in Customer",
          items: [{ description: "Parking Fee", qty: 1, amount: parseFloat(paymentForm.amount) }],
          subtotal: parseFloat(paymentForm.amount), vat: 0, total: parseFloat(paymentForm.amount),
          payment_method: paymentForm.payment_method.toUpperCase(), paid_amount: parseFloat(paymentForm.amount), change: 0,
          duration: formatDuration(durationMin), session: selectedSession,
        });
        setSelectedSession(null);
        setPaymentForm({ session_id: "", amount: "", payment_method: "cash", reference: "", pos_terminal_id: "POS-01", receipt_number: "", paid_by: "", notes: "", phone: "" });
        load();
      } else { const err = await res.json(); setMessage(`Error: ${err.error}`); }
    } catch { setMessage("Server error"); }
    setSaving(false);
  };

  const handleChapaPayment = async () => {
    if (!token || !selectedSession) return;
    setChapaLoading(true); setMessage("");
    try {
      const res = await fetch("/api/membership/parking/chapa/initialize", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: selectedSession.id, amount: parseFloat(paymentForm.amount), phone_number: selectedSession.customer_phone || selectedSession.owner_phone || paymentForm.paid_by, email: selectedSession.owner_email || "", return_url: `${window.location.origin}/dashboard/membership/parking/pos?session=${selectedSession.id}` }),
      });
      const data = await res.json();
      if (data.status === "success" && data.data?.checkout_url) { setChapaUrl(data.data.checkout_url); window.open(data.data.checkout_url, "_blank"); setMessage("Chapa checkout opened in new tab. Complete payment there, then verify below."); }
      else setMessage(`Chapa error: ${data.message || data.error || "Failed to initialize"}`);
    } catch { setMessage("Server error"); }
    setChapaLoading(false);
  };

  const verifyChapaPayment = async () => {
    if (!token || !selectedSession) return;
    setSaving(true); setMessage("");
    try {
      const res = await fetch(`/api/membership/parking/chapa/verify/CHAPA-${selectedSession.company_id}-${selectedSession.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.status === "success") { setMessage("Chapa payment verified! Session completed."); setSelectedSession(null); load(); }
      else setMessage(`Verification: ${data.message || "Payment not yet confirmed"}`);
    } catch { setMessage("Verification error"); }
    setSaving(false);
  };

  const handleAddisPayPayment = async () => {
    if (!token || !selectedSession) return;
    if (!paymentForm.phone) { setMessage("Phone number is required for AddisPay"); return; }
    setAddispayLoading(true); setMessage("");
    try {
      const res = await fetch("/api/membership/parking/addispay/initialize", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: selectedSession.id, amount: parseFloat(paymentForm.amount), phone_number: paymentForm.phone, email: selectedSession.owner_email || "", return_url: `${window.location.origin}/dashboard/membership/parking/pos?session=${selectedSession.id}` }),
      });
      const data = await res.json();
      if (data.status === "success" && data.data?.checkout_url) { setAddispayUrl(data.data.checkout_url); window.open(data.data.checkout_url, "_blank"); setMessage("AddisPay checkout opened in new tab. Complete payment there, then verify below."); }
      else setMessage(`AddisPay error: ${data.message || data.error || "Failed to initialize"}`);
    } catch { setMessage("Server error"); }
    setAddispayLoading(false);
  };

  const verifyAddisPayPayment = async () => {
    if (!token || !selectedSession) return;
    setSaving(true); setMessage("");
    try {
      const res = await fetch(`/api/membership/parking/addispay/verify/ADP-${selectedSession.company_id}-${selectedSession.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.status === "success") { setMessage("AddisPay payment verified! Session completed."); setSelectedSession(null); load(); }
      else setMessage(`Verification: ${data.message || "Payment not yet confirmed"}`);
    } catch { setMessage("Verification error"); }
    setSaving(false);
  };

  const quickAmount = (amount: number) => { setPaymentForm({ ...paymentForm, amount: amount.toString() }); };

  const stopCamera = () => {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
    if (videoRef.current?.srcObject) { (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); videoRef.current.srcObject = null; }
    setScanning(false); setQrDetected("");
  };

  const startCamera = async (deviceId?: string) => {
    stopCamera();
    try {
      const constraints: MediaStreamConstraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanning(true);
      let jsQR: any = null;
      await new Promise<void>((resolve, reject) => {
        if ((window as any).jsQR) { jsQR = (window as any).jsQR; resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
        script.onload = () => { jsQR = (window as any).jsQR; resolve(); };
        script.onerror = reject;
        document.body.appendChild(script);
      });
      if (!jsQR) { setMessage("Failed to load QR scanner library"); stopCamera(); return; }
      scanTimerRef.current = setInterval(() => {
        const video = videoRef.current; const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== 4) return;
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) { setQrDetected(code.data); stopCamera(); lookupQrCode(code.data); }
      }, 500);
    } catch { setMessage("Camera access denied"); }
  };

  const lookupQrCode = async (data: string) => {
    if (!token) return;
    setQrLookupLoading(true);
    try {
      const isBase64 = (str: string) => { try { return btoa(atob(str)) === str; } catch { return false; }};
      let body: any;
      if (isBase64(data)) body = { qr_data: data };
      else { try { const j = JSON.parse(data); body = { ticket_number: j.t || j.ticket_number || j.ticket }; } catch { body = { ticket_number: data }; } }
      const res = await fetch("/api/membership/parking/kiosk/lookup", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const d = await res.json();
      if (res.ok) {
        setQrSession(d); const fee = calculateFee(d); setSelectedSession(d);
        setPaymentForm({ ...paymentForm, session_id: d.id, amount: fee.toString(), receipt_number: `RCP-${d.ticket_number || Date.now()}`, paid_by: d.visitor_name || d.customer_name || "" });
        setTab("checkout"); setMessage(`QR scanned: ${d.visitor_name || d.ticket_number}`);
      } else setMessage(`QR lookup: ${d.error}`);
    } catch { setMessage("QR lookup failed"); }
    setQrLookupLoading(false);
  };

  const printReceipt = () => {
    const r = receipt; if (!r) return;
    const w = window.open("", "_blank"); if (!w) return;
    const logo = r.company?.logo_url || ""; const name = r.company?.name || "Parking System";
    const addr = r.company?.address || ""; const phone = r.company?.phone || "";
    const tax = r.company?.tax_id || "N/A";
    const plate = r.session?.plate_number || r.session?.vehicle_plate || "-";
    w.document.write(`<style>body{font-family:'Courier New',monospace;font-size:12px;width:80mm;margin:0 auto;padding:5mm}.center{text-align:center}.right{text-align:right}table{width:100%;border-collapse:collapse}th,td{padding:2px 0}hr{border:none;border-top:1px dashed #000;margin:4px 0}img{max-height:50px}</style></head><body><div class="center">`);
    if (logo) w.document.write(`<img src="${logo}" alt="Logo"><br>`);
    w.document.write(`<b>${name}</b><br><small>${addr}</small><br><small>${phone}</small><br><small>Tax ID: ${tax}</small></div><hr>`);
    w.document.write(`<div>Receipt: <b>${r.receipt_no}</b> <span class="right">${new Date(r.date).toLocaleDateString()}</span></div>`);
    w.document.write(`<div>Cashier: ${r.cashier} <span class="right">${new Date(r.date).toLocaleTimeString()}</span></div>`);
    w.document.write(`<div>Customer: <b>${r.customer}</b></div><div>Plate: ${plate}</div><hr>`);
    w.document.write(`<table><tr><th>Item</th><th>Qty</th><th class="right">Amount</th></tr>`);
    r.items.forEach(function(i: any) { w.document.write(`<tr><td>${i.description}</td><td>${i.qty}</td><td class="right">ETB ${i.amount.toFixed(2)}</td></tr>`); });
    w.document.write(`</table><hr><div>Subtotal: <span class="right">ETB ${r.subtotal.toFixed(2)}</span></div>`);
    w.document.write(`<div>VAT (0%): <span class="right">ETB ${r.vat.toFixed(2)}</span></div><hr>`);
    w.document.write(`<div class="fw-bold">TOTAL: <span class="right">ETB ${r.total.toFixed(2)}</span></div><hr>`);
    w.document.write(`<div>Paid (${r.payment_method}): <span class="right">ETB ${r.paid_amount.toFixed(2)}</span></div>`);
    w.document.write(`<div>Change: <span class="right">ETB ${r.change.toFixed(2)}</span></div>`);
    if (r.session?.qr_code) w.document.write(`<hr><div class="center"><img src="${r.session.qr_code}" style="width:80px;height:80px"><br><small>Exit Pass</small></div>`);
    w.document.write(`<hr><p class="center">Thank you for visiting!</p></body></html>`);
    w.document.close(); w.print();
  };

  const formatDuration = (min: number) => { const h = Math.floor(min / 60); const m = min % 60; return h > 0 ? `${h}h ${m}m` : `${m} min`; };
  const getDuration = (s: any) => { const exit = s.exit_time ? new Date(s.exit_time).getTime() : Date.now(); return Math.round((exit - new Date(s.entry_time).getTime()) / 60000); };
  const fmtDt = (d: string) => { if (!d) return "-"; const dt = new Date(d); if (isNaN(dt.getTime())) return d; const pad = (n: number) => n.toString().padStart(2, "0"); return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`; };
  const todayRevenue = payments.filter(p => new Date(p.payment_date).toDateString() === new Date().toDateString()).reduce((s, p) => s + Number(p.amount), 0);

  const tabs = [
    { key: "checkout", label: "Checkout", icon: <ShoppingCart size={14} /> },
    { key: "scan", label: "Plate", icon: <Search size={14} /> },
    { key: "phone", label: "Phone", icon: <Phone size={14} /> },
    { key: "qrscan", label: "QR", icon: <QrCode size={14} /> },
    { key: "camera", label: "Camera Scan", icon: <Camera size={14} /> },
  ];

  return (
    <GemPage>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <GemHeader
        title="POS Terminal"
        subtitle="Process parking payments and print receipts"
        actions={
          <div className="text-right">
            <p className="text-xs text-gray-500">Today&apos;s Revenue</p>
            <p className="text-xl font-bold text-emerald-600">ETB {todayRevenue.toLocaleString()}</p>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GemCard className="mb-6">
            <div className="flex gap-1 mb-4 border-b border-gray-100 pb-3 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1 ${tab === t.key ? "bg-black text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>

            {tab === "scan" && (
              <div>
                <div className="flex gap-2 mb-4">
                  <GemInput placeholder="Scan or type plate number..." value={plateSearch} onChange={e => setPlateSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchByPlate()} className="text-lg" />
                  <GemBtn onClick={searchByPlate}><Search size={18} /></GemBtn>
                </div>
                <div className="text-center py-8 text-gray-400"><p className="text-sm">Search by vehicle plate number</p></div>
              </div>
            )}

            {tab === "phone" && (
              <div>
                <div className="flex gap-2 mb-4">
                  <GemInput placeholder="Search by phone number..." value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchByPhone()} className="text-lg" />
                  <GemBtn onClick={searchByPhone}><Search size={18} /></GemBtn>
                </div>
                <div className="text-center py-8 text-gray-400"><p className="text-sm">Search by customer phone number to find their session</p></div>
              </div>
            )}

            {tab === "qrscan" && (
              <div>
                <div className="flex gap-2 mb-4">
                  <GemInput placeholder="Paste QR data or type ticket number..." value={qrInput} onChange={e => { setQrInput(e.target.value); setQrSession(null); }} onKeyDown={async e => {
                    if (e.key === "Enter" && qrInput.trim()) {
                      setQrLookupLoading(true); setMessage("");
                      try {
                        const v = qrInput.trim();
                        const isBase64 = (str: string) => { try { return btoa(atob(str)) === str; } catch { return false; }};
                        let body: any;
                        if (isBase64(v)) body = { qr_data: v };
                        else { try { const j = JSON.parse(v); body = { ticket_number: j.t || j.ticket_number || j.ticket }; } catch { body = { ticket_number: v }; } }
                        const res = await fetch("/api/membership/parking/kiosk/lookup", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
                        const data = await res.json();
                        if (res.ok) { setQrSession(data); const fee = calculateFee(data); setSelectedSession(data); setPaymentForm({ ...paymentForm, session_id: data.id, amount: fee.toString(), receipt_number: `RCP-${data.ticket_number || Date.now()}`, paid_by: data.visitor_name || data.customer_name || "" }); setTab("checkout"); }
                        else setMessage(`Error: ${data.error}`);
                      } catch { setMessage("Lookup failed"); }
                      setQrLookupLoading(false);
                    }
                  }} />
                  <GemBtn onClick={async () => {
                    setQrLookupLoading(true); setMessage("");
                    try {
                      const v = qrInput.trim();
                      const isBase64 = (str: string) => { try { return btoa(atob(str)) === str; } catch { return false; }};
                      let body: any;
                      if (isBase64(v)) body = { qr_data: v };
                      else { try { const j = JSON.parse(v); body = { ticket_number: j.t || j.ticket_number || j.ticket }; } catch { body = { ticket_number: v }; } }
                      const res = await fetch("/api/membership/parking/kiosk/lookup", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
                      const data = await res.json();
                      if (res.ok) { setQrSession(data); const fee = calculateFee(data); setSelectedSession(data); setPaymentForm({ ...paymentForm, session_id: data.id, amount: fee.toString(), receipt_number: `RCP-${data.ticket_number || Date.now()}`, paid_by: data.visitor_name || data.customer_name || "" }); setTab("checkout"); }
                      else setMessage(`Error: ${data.error}`);
                    } catch { setMessage("Lookup failed"); }
                    setQrLookupLoading(false);
                  }} disabled={qrLookupLoading || !qrInput.trim()}>{qrLookupLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={18} />}</GemBtn>
                </div>
                {qrSession && (
                  <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold">{qrSession.visitor_name || qrSession.customer_name}</span>
                      <GemBadge variant="info">{qrSession.calculated_duration_display}</GemBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Ticket: <strong>{qrSession.qr_ticket_number}</strong></span>
                      <span>Session: <strong>{qrSession.ticket_number}</strong></span>
                      <span>Entry: <strong>{fmtDt(qrSession.entry_time)}</strong></span>
                      <span>Zone: <strong>{qrSession.zone_name || "-"}</strong></span>
                    </div>
                  </div>
                )}
                <div className="text-center py-8 text-gray-400"><p className="text-sm">Paste scanned QR data or type ticket number</p></div>
              </div>
            )}

            {tab === "camera" && (
              <div>
                <div className="flex gap-2 mb-3">
                  <GemSelect value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)} className="flex-1">
                    <option value="">Default Camera (Back-facing)</option>
                    {cameras.filter(c => c.protocol === "webcam" || c.protocol === "http").map(c => <option key={c.id} value={c.id}>{c.name} ({c.protocol})</option>)}
                    <option value="__front__">Front Camera</option>
                  </GemSelect>
                  <button className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all inline-flex items-center gap-2 ${scanning ? "bg-red-500 text-white" : "bg-emerald-600 text-white hover:opacity-90"}`} onClick={() => { if (scanning) stopCamera(); else startCamera(selectedCamera || undefined); }}>
                    {scanning ? "Stop" : "Start Camera"}
                  </button>
                </div>
                <div className="relative bg-black rounded-2xl overflow-hidden" style={{ minHeight: 300 }}>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full" style={{ objectFit: "contain", minHeight: 300 }} />
                  {!scanning && !qrDetected && <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">Click Start Camera to scan QR codes</div>}
                  {scanning && <div className="absolute top-3 right-3"><GemBadge variant="success">Scanning...</GemBadge></div>}
                  {qrDetected && <div className="absolute bottom-0 inset-x-0 p-2 bg-emerald-600 text-white text-center text-sm">QR Detected: {qrDetected.slice(0, 50)}...</div>}
                </div>
              </div>
            )}

            {message && <GemAlert type={message.includes("successful") || message.includes("Detected") || message.includes("scanned") ? "success" : "warning"} className="mt-4">{message}</GemAlert>}

            {tab === "checkout" && !selectedSession && (
              <div className="text-center py-8 text-gray-400"><p className="text-sm">Select a session from the pending list or search to bill</p></div>
            )}

            {tab === "checkout" && selectedSession && (
              <div>
                <div className="bg-gray-50 rounded-2xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div><p className="text-gray-400 text-xs">Ticket</p><p className="font-bold">{selectedSession.ticket_number}</p></div>
                  <div><p className="text-gray-400 text-xs">Plate / Customer</p><p className="font-bold text-lg">{selectedSession.plate_number || selectedSession.vehicle_plate || selectedSession.visitor_name || selectedSession.customer_name}</p></div>
                  <div><p className="text-gray-400 text-xs">Phone</p><p>{selectedSession.customer_phone || selectedSession.owner_phone || selectedSession.visitor_phone || "-"}</p></div>
                  <div><p className="text-gray-400 text-xs">Entry</p><p>{fmtDt(selectedSession.entry_time)}</p></div>
                  <div><p className="text-gray-400 text-xs">Exit</p><p>{selectedSession.exit_time ? fmtDt(selectedSession.exit_time) : "-"}</p></div>
                  <div><p className="text-gray-400 text-xs">Duration</p><p className="font-bold">{formatDuration(getDuration(selectedSession))}</p></div>
                  <div><p className="text-gray-400 text-xs">Zone / Slot</p><GemBadge variant="info">{selectedSession.zone_name || "-"} / {selectedSession.slot_number || "-"}</GemBadge></div>
                  <div><p className="text-gray-400 text-xs">Owner</p><p>{selectedSession.customer_name || selectedSession.visitor_name || selectedSession.owner_name || "-"}</p></div>
                </div>
                <form onSubmit={handlePayment} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-gray-500 font-medium mb-1 block">Amount (ETB) <span className="text-red-500">*</span></label>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                      <span className="px-3 bg-gray-50 text-sm text-gray-500 border-r border-gray-200">ETB</span>
                      <input type="number" required value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="flex-1 px-3 py-2.5 text-lg font-bold focus:outline-none" />
                    </div>
                    <div className="flex gap-1 mt-2">
                      {[50, 100, 150, 200, 300, 500].map(a => (
                        <button key={a} type="button" className="text-xs border border-gray-200 px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => quickAmount(a)}>{a}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium mb-1 block">Payment Method</label>
                    <GemSelect value={paymentForm.payment_method} onChange={e => setPaymentForm({...paymentForm, payment_method: e.target.value})}>
                      <option value="cash">Cash</option><option value="telebirr">Telebirr</option><option value="cbebirr">CBE Birr</option>
                      <option value="chapa">Chapa</option><option value="addispay">AddisPay</option><option value="santimpay">SantimPay</option><option value="bank">Bank Transfer</option>
                      <option value="pos">POS Machine</option><option value="credit_card">Credit Card</option><option value="debit_card">Debit Card</option>
                    </GemSelect>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium mb-1 block">POS Terminal</label>
                    <GemInput value={paymentForm.pos_terminal_id} onChange={e => setPaymentForm({...paymentForm, pos_terminal_id: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium mb-1 block">Reference</label>
                    <GemInput value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium mb-1 block">Receipt #</label>
                    <GemInput value={paymentForm.receipt_number} onChange={e => setPaymentForm({...paymentForm, receipt_number: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 font-medium mb-1 block">Paid By</label>
                    <GemInput value={paymentForm.paid_by} onChange={e => setPaymentForm({...paymentForm, paid_by: e.target.value})} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-sm text-gray-500 font-medium mb-1 block">Notes</label>
                    <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/30 transition-all" rows={2} value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} />
                  </div>
                  {paymentForm.payment_method === "addispay" && (
                    <div className="sm:col-span-3">
                      <label className="text-sm text-gray-500 font-medium mb-1 block">Phone Number (for AddisPay) <span className="text-red-500">*</span></label>
                      <GemInput placeholder="09XXXXXXXX or 2519XXXXXXXX" value={paymentForm.phone || ""} onChange={e => setPaymentForm({...paymentForm, phone: e.target.value})} />
                    </div>
                  )}
                  <div className="sm:col-span-3">
                    {paymentForm.payment_method === "chapa" ? (
                      <div className="flex gap-2">
                        <GemBtn onClick={handleChapaPayment} className="flex-1">{chapaLoading ? "Connecting to Chapa..." : "Pay with Chapa"}</GemBtn>
                        {chapaUrl && <GemBtnOutline onClick={verifyChapaPayment} className="text-emerald-600">{saving ? "Verifying..." : "Verify Payment"}</GemBtnOutline>}
                      </div>
                    ) : paymentForm.payment_method === "addispay" ? (
                      <div className="flex gap-2">
                        <GemBtn onClick={handleAddisPayPayment} className="flex-1">{addispayLoading ? "Connecting to AddisPay..." : "Pay with AddisPay"}</GemBtn>
                        {addispayUrl && <GemBtnOutline onClick={verifyAddisPayPayment} className="text-emerald-600">{saving ? "Verifying..." : "Verify Payment"}</GemBtnOutline>}
                      </div>
                    ) : (
                      <GemBtn type="submit" className="w-full bg-emerald-600" onClick={() => {}}>{saving ? "Processing..." : "Process Payment & Print Receipt"}</GemBtn>
                    )}
                  </div>
                </form>
              </div>
            )}
          </GemCard>
        </div>

        <div className="space-y-4">
          <GemCard>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm">Pending Payments</h3>
              <GemSelect value={zoneFilter} onChange={e => setZoneFilter(e.target.value)} className="w-36 text-xs">
                <option value="">All Zones</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name} ({z.occupied_slots || 0}/{z.total_slots || 0})</option>)}
              </GemSelect>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1 -mx-2">
              {filteredSessions.length === 0 ? (
                <p className="text-center text-gray-400 py-4 text-sm">No pending payments</p>
              ) : filteredSessions.map(s => (
                <button key={s.id} className={`w-full text-left p-3 rounded-xl transition-all ${selectedSession?.id === s.id ? "bg-black text-white" : "hover:bg-gray-50"}`} onClick={() => selectSession(s)}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{s.plate_number || s.vehicle_plate || s.visitor_name || s.customer_name}</span>
                    <GemBadge variant="warning" className={selectedSession?.id === s.id ? "bg-amber-500 text-white" : ""}>ETB {calculateFee(s)}</GemBadge>
                  </div>
                  <p className={`text-xs mt-1 ${selectedSession?.id === s.id ? "text-white/70" : "text-gray-400"}`}>
                    {s.vehicle_type || "Walk-in"} | {new Date(s.entry_time).toLocaleString()} | {s.zone_name || "-"}
                  </p>
                  <p className={`text-xs ${selectedSession?.id === s.id ? "text-white/70" : "text-gray-400"}`}>
                    Duration: {formatDuration(getDuration(s))} | {s.ticket_number}{s.customer_phone ? ` | ${s.customer_phone}` : ""}
                  </p>
                </button>
              ))}
            </div>
          </GemCard>

          <GemCard>
            <h3 className="font-semibold text-sm mb-3">Today&apos;s Payments</h3>
            <div className="max-h-72 overflow-y-auto space-y-1 -mx-2">
              {payments.filter(p => new Date(p.payment_date).toDateString() === new Date().toDateString()).length === 0 ? (
                <p className="text-center text-gray-400 py-4 text-sm">No payments today</p>
              ) : payments.filter(p => new Date(p.payment_date).toDateString() === new Date().toDateString()).map(p => (
                <div key={p.id} className="p-2">
                  <div className="flex justify-between">
                    <span className="font-medium text-sm">{p.plate_number || p.ticket_number}</span>
                    <span className="font-bold text-sm text-emerald-600">+ETB {Number(p.amount).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-400">{p.payment_method} | {new Date(p.payment_date).toLocaleTimeString()}</p>
                </div>
              ))}
            </div>
          </GemCard>
        </div>
      </div>

      {receipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 text-center border-b border-gray-100">
              {receipt.company?.logo_url && <img src={receipt.company.logo_url} alt="Logo" loading="lazy" style={{ height: 50 }} className="mx-auto mb-2" />}
              <h3 className="font-bold text-lg">{receipt.company?.name || "Parking System"}</h3>
              <p className="text-xs text-gray-400">{receipt.company?.address || ""}{receipt.company?.phone ? ` | ${receipt.company.phone}` : ""}</p>
              <p className="text-xs text-gray-400">Tax ID: {receipt.company?.tax_id || "N/A"}</p>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span>Receipt No: <strong>{receipt.receipt_no}</strong></span><span>{new Date(receipt.date).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span>Cashier: {receipt.cashier}</span><span>{new Date(receipt.date).toLocaleTimeString()}</span></div>
              <p>Customer: <strong>{receipt.customer}</strong></p>
              <p>Plate: {receipt.session?.plate_number || receipt.session?.vehicle_plate || "-"}</p>
              <p>Entry: {receipt.session?.entry_time ? new Date(receipt.session.entry_time).toLocaleString() : "-"}</p>
              <p>Exit: {receipt.session?.exit_time ? new Date(receipt.session.exit_time).toLocaleString() : "-"}</p>
              <p>Duration: <strong>{receipt.duration}</strong></p>
              <hr className="border-gray-100" />
              <table className="w-full text-sm"><thead><tr><th className="text-left">Item</th><th className="text-center">Qty</th><th className="text-right">Amount</th></tr></thead><tbody>
                {receipt.items.map((item: any, i: number) => <tr key={i}><td>{item.description}</td><td className="text-center">{item.qty}</td><td className="text-right">ETB {item.amount.toFixed(2)}</td></tr>)}
              </tbody></table>
              <hr className="border-gray-100" />
              <div className="flex justify-between"><span>Subtotal:</span><span>ETB {receipt.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>VAT (0%):</span><span>ETB {receipt.vat.toFixed(2)}</span></div>
              <hr className="border-gray-100" />
              <div className="flex justify-between font-bold text-lg"><span>TOTAL:</span><span>ETB {receipt.total.toFixed(2)}</span></div>
              <hr className="border-gray-100" />
              <div className="flex justify-between"><span>Paid ({receipt.payment_method}):</span><span>ETB {receipt.paid_amount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Change:</span><span>ETB {receipt.change.toFixed(2)}</span></div>
              {receipt.session?.qr_code && <div className="text-center pt-2"><img src={receipt.session.qr_code} alt="QR" loading="lazy" style={{ width: 80, height: 80 }} className="mx-auto" /><p className="text-xs text-gray-400">Exit Pass</p></div>}
              <p className="text-center text-gray-400 text-xs pt-2">Thank you for visiting!</p>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <GemBtn onClick={printReceipt} className="flex-1">Print Receipt</GemBtn>
              <GemBtnOutline onClick={() => setReceipt(null)}><X size={16} />Close</GemBtnOutline>
            </div>
          </div>
        </div>
      )}
    </GemPage>
  );
}
