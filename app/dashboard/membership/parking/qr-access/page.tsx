"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { GemPage, GemHeader, GemCardBare } from "@/lib/gem-ui";
import { ShieldCheck, CreditCard, AlertTriangle, XOctagon, Activity, DoorOpen, ArrowRight, ArrowLeft, CheckCircle, XCircle, Wifi, WifiOff, RefreshCw, SlidersHorizontal, QrCode, Camera, CameraOff, ScanLine } from "lucide-react";

function MiniSpark({ value, max, color }: { value: number; max: number; color: string }) {
  const bars = 5;
  const heights = Array.from({ length: bars }, (_, i) => {
    const base = Math.round((value / max) * 12);
    return Math.max(2, base + Math.floor(Math.sin(i * 1.2) * 3));
  });
  return (
    <div className="flex items-end gap-[2px] h-3 mt-1.5">
      {heights.map((h, i) => (
        <div key={i} className={`w-[3px] rounded-sm ${color}`} style={{ height: h * 2, opacity: 0.4 + (i / bars) * 0.6 }} />
      ))}
    </div>
  );
}

export default function QRAccessPage() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [doorMsg, setDoorMsg] = useState("");
  const lastSeenRef = useRef<string>("");
  const [gates, setGates] = useState<any[]>([]);
  const [selectedGateId, setSelectedGateId] = useState<string>("");
  const [selectedGate, setSelectedGate] = useState<any>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const pollRef = useRef<any>(null);
  const pingRef = useRef<any>(null);
  const [showLimit, setShowLimit] = useState(50);
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");
  const [cameraActive, setCameraActive] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<any>(null);
  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const lastScanKey = useRef<string>("");
  const lastScanTime = useRef<number>(0);
  const processingRef = useRef<boolean>(false);

  const cellPad = density === "compact" ? "py-2 px-3" : "py-3.5 px-4";
  const textSize = density === "compact" ? "text-[11px]" : "text-xs";

  const loadGates = async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/membership/parking/gates", { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      const list = Array.isArray(data) ? data : data.data || [];
      setGates(list);
      const stored = localStorage.getItem("selectedGateQrAccess");
      const found = stored ? list.find((g: any) => g.id == stored) : null;
      const initial = found || list.find((g: any) => g.is_qr_enabled) || list[0];
      if (initial) { setSelectedGateId(String(initial.id)); setSelectedGate(initial); localStorage.setItem("selectedGateQrAccess", String(initial.id)); }
    } catch {}
  };

  const handleGateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedGateId(id);
    setSelectedGate(gates.find(g => g.id == id) || null);
    localStorage.setItem("selectedGateQrAccess", id);
  };

  const checkRelay = useCallback(async () => {
    try {
      if (!token) return;
      const r = await fetch("/api/parking/access/relay", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setConnected(d.ok && d.relay_online);
    } catch { setConnected(false); }
  }, [token]);

  const pollLogs = useCallback(async () => {
    if (!token) return;
    try {
      const sinceParam = lastSeenRef.current ? `&since=${encodeURIComponent(lastSeenRef.current)}` : "";
      const r = await fetch(`/api/parking/access/qr-live?limit=100${sinceParam}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.ok && d.data?.length) {
        const newLogs = lastSeenRef.current
          ? d.data.filter((l: any) => l.time > lastSeenRef.current)
          : d.data.slice(0, 50);
        if (newLogs.length > 0) {
          lastSeenRef.current = newLogs[0].time;
          const mapped = newLogs.map((l: any) => ({
            id: l.id,
            card: l.card_uid,
            name: l.member_name,
            direction: l.direction || "IN",
            note: l.message || "",
            time: new Date(l.time).toLocaleString(),
            granted: l.granted,
            days_remaining: l.days_remaining,
            plan_name: l.plan_name,
            member_id: l.member_id,
            photo_url: l.photo_url,
            member_code: l.member_code,
            reason: l.reason,
            subscription_id: l.subscription_id,
          }));
          setActivities(prev => [...mapped, ...prev].slice(0, 200));
        }
      } else if (d.ok && !lastSeenRef.current && d.data?.length === 0) {
        lastSeenRef.current = "init";
      }
    } catch {}
  }, [token]);

  const openDoor = async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/parking/access/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "open" }),
      });
      const d = await r.json();
      if (d.success) setDoorMsg("Door command sent to relay!");
      else setDoorMsg("Failed to send door command");
    } catch { setDoorMsg("Door command sent!"); }
    setTimeout(() => setDoorMsg(""), 3000);
  };

  const lookupQr = async (parsed: any) => {
    try {
      const tok = localStorage.getItem("token");
      if (!tok) return null;
      const r = await fetch("/api/parking/access/qr-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ subscription_id: parsed.sid, company_id: parsed.cid }),
      });
      return await r.json();
    } catch { return null; }
  };

  const processQrScan = useCallback(async (rawText: string) => {
    const now = Date.now();
    if (processingRef.current) return;
    if (rawText === lastScanKey.current && now - lastScanTime.current < 5000) return;

    let parsed: any;
    try { parsed = JSON.parse(rawText); } catch { return; }
    if (!parsed || parsed.t !== "sub" || !parsed.sid) return;

    processingRef.current = true;
    lastScanKey.current = rawText;
    lastScanTime.current = now;

    try {
      const lookup = await lookupQr(parsed);
      const granted = lookup?.granted || false;
      const name = lookup?.member?.name || null;
      const plan = lookup?.subscription?.plan_name || null;
      const days = lookup?.days_remaining ?? 0;

      setLastScanResult({
        id: Date.now(), card: `QR-${parsed.sid}`, name, granted,
        plan, days, note: lookup?.message || lookup?.reason || "Unknown",
      });
      setTimeout(() => setLastScanResult(null), 8000);
    } finally {
      processingRef.current = false;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (cameraActive) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scannerId = "qr-webcam-scanner";
      const container = document.getElementById(scannerId);
      if (!container) return;

      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => { processQrScan(decodedText); },
        () => {}
      );
      setCameraActive(true);
    } catch (e: any) {
      console.error("QR Scanner error:", e);
      setCameraActive(false);
    }
  }, [cameraActive, processQrScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => { loadGates(); checkRelay(); pollLogs(); pingRef.current = setInterval(checkRelay, 10000); return () => { clearInterval(pingRef.current); if (pollRef.current) clearInterval(pollRef.current); }; }, []);
  useEffect(() => { if (pollRef.current) clearInterval(pollRef.current); pollLogs(); pollRef.current = setInterval(pollLogs, 3000); return () => clearInterval(pollRef.current); }, [pollLogs]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  const qrStats = activities.filter(a => a.card?.startsWith("QR-"));
  const granted = qrStats.filter(a => a.granted);
  const denied = qrStats.filter(a => !a.granted);
  const all = qrStats.length || 1;

  const eventText = (a: any) => {
    if (a.granted) return "Access granted";
    switch (a.reason) {
      case "SUBSCRIPTION_NOT_FOUND": return "QR not valid";
      case "SUBSCRIPTION_CANCELLED": return "Subscription cancelled";
      case "SUBSCRIPTION_EXPIRED": return "Subscription expired";
      case "SUBSCRIPTION_FROZEN": return "Subscription frozen";
      case "SUBSCRIPTION_NOT_STARTED": return "Not yet active";
      default: return a.note || "Access denied";
    }
  };

  return (
    <GemPage>
      <GemHeader
        title="QR Access Control"
        subtitle="Live QR code scan monitoring with webcam scanner"
        actions={
          <div className="flex items-center gap-3">
            <select className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20" style={{ minWidth: 180 }}
              value={selectedGateId} onChange={handleGateChange}>
              {gates.map(g => <option key={g.id} value={g.id}>{g.name} ({g.ip_address || "no IP"})</option>)}
            </select>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {connected ? "Relay Online" : "Relay Offline"}
            </div>
            <button onClick={openDoor} className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all active:scale-[0.97] inline-flex items-center gap-2 shadow-sm shadow-emerald-200">
              <DoorOpen size={16} /> Open Door
            </button>
            <button className="border border-gray-200 p-2.5 rounded-xl hover:bg-gray-50 transition-all active:scale-95" onClick={() => { setLoading(true); checkRelay(); lastSeenRef.current = ""; pollLogs(); }}>
              <RefreshCw size={16} className="text-gray-600" />
            </button>
          </div>
        }
      />

      {doorMsg && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border mb-6 text-sm font-medium ${doorMsg.includes("Failed") ? "bg-red-50 text-red-800 border-red-200" : "bg-green-50 text-green-800 border-green-200"}`}>
          {doorMsg.includes("Failed") ? <XCircle size={16} /> : <CheckCircle size={16} />}
          <span className="flex-1">{doorMsg}</span>
          <button onClick={() => setDoorMsg("")} className="text-current opacity-50 hover:opacity-100 text-lg leading-none">&times;</button>
        </div>
      )}

      {!connected && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border bg-amber-50 text-amber-800 border-amber-200 mb-6 text-sm font-medium">
          <WifiOff size={16} />
          <span>Relay not reachable — QR scans still logged to DB</span>
        </div>
      )}

      {/* Webcam Scanner + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Webcam Scanner */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Camera size={16} /> Webcam Scanner
            </h3>
            <button
              onClick={cameraActive ? stopScanner : startScanner}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${cameraActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-purple-50 text-purple-600 hover:bg-purple-100"}`}
            >
              {cameraActive ? <><CameraOff size={12} className="inline mr-1" />Stop</> : <><Camera size={12} className="inline mr-1" />Start</>}
            </button>
          </div>
          <div id="qr-webcam-scanner" ref={scannerContainerRef} className="rounded-xl overflow-hidden bg-gray-100" style={{ minHeight: 200 }}></div>
          {!cameraActive && (
            <div className="text-center py-8 text-gray-400">
              <ScanLine size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Click Start to scan QR codes via webcam</p>
            </div>
          )}
          {lastScanResult && (
            <div className={`mt-3 p-3 rounded-xl text-sm ${lastScanResult.granted ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center gap-2 mb-1">
                {lastScanResult.granted ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-red-500" />}
                <span className={`font-semibold ${lastScanResult.granted ? "text-emerald-700" : "text-red-700"}`}>{lastScanResult.name || "Unknown"}</span>
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-3">
                {lastScanResult.plan && <span>Plan: {lastScanResult.plan}</span>}
                {lastScanResult.days > 0 && <span className="text-emerald-600 font-semibold">{lastScanResult.days}d left</span>}
                <span>{lastScanResult.note}</span>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="lg:col-span-2 grid grid-cols-3 gap-5">
          {[
            { title: "Total QR Scans", value: qrStats.length, max: all, icon: QrCode, bg: "from-purple-500 to-purple-600" },
            { title: "Granted", value: granted.length, max: all, icon: CheckCircle, bg: "from-emerald-500 to-emerald-600" },
            { title: "Denied", value: denied.length, max: all, icon: XCircle, bg: "from-red-500 to-red-600" },
          ].map(card => (
            <div key={card.title} className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{card.title}</p>
                  <h2 className="text-2xl font-bold text-gray-900 mt-1">{card.value}</h2>
                  <MiniSpark value={card.value} max={card.max} color="bg-purple-500" />
                </div>
                <div className={`bg-gradient-to-br ${card.bg} text-white p-3.5 rounded-2xl`}>
                  <card.icon size={20} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live QR Event Table */}
      <GemCardBare>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <QrCode size={18} className="text-purple-600" />
            <span className="font-semibold text-base">Live QR Event Feed</span>
            <span className="text-xs text-gray-400 font-medium ml-1">({activities.length})</span>
          </div>
          <div className="flex items-center gap-3">
            <button className={`text-xs font-medium px-3 py-2 rounded-xl border transition-all ${density === "compact" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"}`}
              onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}>
              <SlidersHorizontal size={13} className="inline mr-1" />{density === "compact" ? "Compact" : "Comfortable"}
            </button>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${activities.length > 0 ? "bg-purple-50 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
              <span className={`w-2 h-2 rounded-full ${activities.length > 0 ? "bg-purple-500 animate-pulse" : "bg-gray-400"}`}></span>
              {activities.length > 0 ? "LIVE" : "WAITING"}
            </span>
          </div>
        </div>
        {activities.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <QrCode size={40} className="mx-auto mb-4 opacity-40" />
            <p className="text-sm font-medium">Waiting for QR scan...</p>
            <p className="text-xs mt-1">QR scan events will appear here automatically</p>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto" style={{ maxHeight: density === "compact" ? 800 : 620 }}>
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white">
                    {["Time", "Name", "Plan", "Remaining", "QR ID", "Event"].map(h => (
                      <th key={h} className={`text-left ${textSize} text-gray-500 font-semibold uppercase tracking-wider ${cellPad} border-b border-gray-100`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activities.slice(0, showLimit).map((a, i) => (
                    <tr key={a.id || i} className={`border-b border-gray-50 transition-colors hover:bg-gray-50/50 ${a.granted ? "bg-emerald-50/20 border-l-[3px] border-l-emerald-500" : "bg-red-50/20 border-l-[3px] border-l-red-400"}`}>
                      <td className={cellPad}><span className={`${textSize} text-gray-400 font-mono tabular-nums`}>{a.time}</span></td>
                      <td className={cellPad}>
                        {a.name ? (
                          <span className={`font-semibold ${density === "compact" ? "text-xs" : "text-sm"} text-gray-800`}>{a.name}</span>
                        ) : (
                          <span className={`text-gray-400 italic ${density === "compact" ? "text-xs" : "text-sm"}`}>Unknown</span>
                        )}
                      </td>
                      <td className={cellPad}>
                        {a.plan_name ? (
                          <span className={`${textSize} font-medium text-purple-600 bg-purple-50 px-2.5 py-1 rounded-md inline-block max-w-[130px] truncate`}>{a.plan_name}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={cellPad}>
                        {a.days_remaining != null ? (
                          <span className={`${textSize} font-bold ${a.days_remaining > 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {a.days_remaining > 0 ? `${a.days_remaining}d` : "Expired"}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={cellPad}><code className={`${textSize} bg-purple-50 px-2.5 py-1 rounded-md font-mono text-purple-600`}>{a.card}</code></td>
                      <td className={cellPad}>
                        <span className={`inline-flex items-center gap-1.5 ${textSize} font-semibold ${a.granted ? "text-emerald-600" : "text-red-500"}`}>
                          {a.granted ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          {eventText(a)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activities.length > showLimit && (
              <div className="flex justify-center py-3 border-t border-gray-100">
                <button className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors px-4 py-2 rounded-xl hover:bg-gray-50"
                  onClick={() => setShowLimit(prev => prev + 50)}>
                  Show more ({activities.length - showLimit} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </GemCardBare>
    </GemPage>
  );
}
