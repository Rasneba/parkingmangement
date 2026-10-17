"use client";
import { useEffect, useState, useRef } from "react";
import { GemPage, GemHeader, GemCard, GemCardBare, GemBtn, GemBtnOutline, GemTable, GemBadge, GemInput, GemSelect } from "@/lib/gem-ui";
import { Camera, Plus, X, Save, Laptop, Eye, Square } from "lucide-react";

export default function ParkingCamerasPage() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [gates, setGates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ gate_id: "", name: "", code: "", ip_address: "", port: "80", rtsp_url: "", direction: "in", protocol: "http", confidence_threshold: "85" });
  const [saving, setSaving] = useState(false);
  const [webcams, setWebcams] = useState<MediaDeviceInfo[]>([]);
  const [scanningWebcams, setScanningWebcams] = useState(false);
  const [webcamPreview, setWebcamPreview] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [cRes, gRes] = await Promise.all([
        fetch("/api/membership/parking/cameras", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/membership/parking/gates", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cData = await cRes.json();
      const gData = await gRes.json();
      if (Array.isArray(cData)) setCameras(cData);
      if (Array.isArray(gData)) setGates(gData);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    return () => { if (previewRef.current?.srcObject) { (previewRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); } };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/membership/parking/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, gate_id: form.gate_id ? parseInt(form.gate_id) : null, port: form.protocol === "webcam" ? null : (parseInt(form.port) || 80), confidence_threshold: form.protocol === "webcam" ? null : (parseFloat(form.confidence_threshold) || 85) }),
      });
      if (res.ok) { setShowForm(false); setForm({ gate_id: "", name: "", code: "", ip_address: "", port: "80", rtsp_url: "", direction: "in", protocol: "http", confidence_threshold: "85" }); load(); }
      else { const err = await res.json(); alert(err.error); }
    } catch { alert("Server error"); }
    setSaving(false);
  };

  const detectWebcams = async () => {
    setScanningWebcams(true);
    setWebcams([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === "videoinput");
      setWebcams(videoDevices);
      if (videoDevices.length > 0) {
        const first = videoDevices[0];
        setForm({ ...form, name: first.label || "Laptop Webcam", code: "WEBCAM", ip_address: "", port: "", rtsp_url: "", protocol: "webcam", confidence_threshold: "" });
        setShowForm(true);
      }
    } catch { alert("Camera access denied or no webcam detected"); }
    setScanningWebcams(false);
  };

  const previewWebcam = async (deviceId: string) => {
    try {
      if (previewRef.current?.srcObject) { (previewRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      if (previewRef.current) { previewRef.current.srcObject = stream; }
      setWebcamPreview(deviceId);
    } catch { alert("Failed to preview webcam"); }
  };

  const stopPreview = () => {
    if (previewRef.current?.srcObject) { (previewRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); previewRef.current.srcObject = null; }
    setWebcamPreview(null);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, "success" | "default" | "danger" | "warning"> = { active: "success", inactive: "default", offline: "danger", maintenance: "warning" };
    return <GemBadge variant={map[s] || "default"}>{s}</GemBadge>;
  };

  return (
    <GemPage>
      <GemHeader
        title="Cameras"
        subtitle="Configure ANPR cameras and laptop webcams"
        actions={
          <>
            <GemBtnOutline onClick={detectWebcams} className={scanningWebcams ? "opacity-50 pointer-events-none" : ""}>
              <Laptop size={16} />{scanningWebcams ? "Detecting..." : "Use Webcam"}
            </GemBtnOutline>
            <GemBtn onClick={() => { setShowForm(!showForm); setForm({ gate_id: "", name: "", code: "", ip_address: "", port: "80", rtsp_url: "", direction: "in", protocol: "http", confidence_threshold: "85" }); }}>
              {showForm ? <X size={16} /> : <Plus size={16} />}{showForm ? "Cancel" : "Add Camera"}
            </GemBtn>
          </>
        }
      />

      {showForm && (
        <GemCard className="mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Camera size={18} />Register Camera</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Camera Name <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.name} onChange={(e: any) => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Code <span className="text-red-500">*</span></label>
              <GemInput type="text" required value={form.code} onChange={(e: any) => setForm({...form, code: e.target.value})} />
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Gate</label>
              <GemSelect value={form.gate_id} onChange={(e: any) => setForm({...form, gate_id: e.target.value})}>
                <option value="">No Gate</option>
                {gates.map(g => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
              </GemSelect>
            </div>
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Direction</label>
              <GemSelect value={form.direction} onChange={(e: any) => setForm({...form, direction: e.target.value})}>
                <option value="in">Entry</option>
                <option value="out">Exit</option>
                <option value="both">Both</option>
              </GemSelect>
            </div>
            {form.protocol !== "webcam" && (
              <>
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-500 font-medium mb-1 block">IP Address <span className="text-red-500">*</span></label>
                  <GemInput type="text" required={form.protocol !== "webcam"} value={form.ip_address} onChange={(e: any) => setForm({...form, ip_address: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm text-gray-500 font-medium mb-1 block">Port</label>
                  <GemInput type="number" value={form.port} onChange={(e: any) => setForm({...form, port: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm text-gray-500 font-medium mb-1 block">RTSP URL</label>
                  <GemInput type="text" value={form.rtsp_url} onChange={(e: any) => setForm({...form, rtsp_url: e.target.value})} placeholder="rtsp://..." />
                </div>
              </>
            )}
            <div>
              <label className="text-sm text-gray-500 font-medium mb-1 block">Protocol</label>
              <GemSelect value={form.protocol} onChange={(e: any) => setForm({...form, protocol: e.target.value})}>
                <option value="http">HTTP</option>
                <option value="rtsp">RTSP</option>
                <option value="onvif">ONVIF</option>
                <option value="tcp_ip">TCP/IP</option>
                <option value="webcam">Webcam (Laptop)</option>
              </GemSelect>
            </div>
            {form.protocol !== "webcam" && (
              <div>
                <label className="text-sm text-gray-500 font-medium mb-1 block">Confidence Threshold (%)</label>
                <GemInput type="number" value={form.confidence_threshold} onChange={(e: any) => setForm({...form, confidence_threshold: e.target.value})} />
              </div>
            )}
            <div className="md:col-span-4">
              <GemBtn type="submit" disabled={saving}>
                <Save size={16} />{saving ? "Saving..." : "Save Camera"}
              </GemBtn>
            </div>
          </form>
        </GemCard>
      )}

      {webcams.length > 0 && (
        <GemCard className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Laptop size={18} />Detected Webcams</h3>
            <GemBadge variant="info">{webcams.length} found</GemBadge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {webcams.map((w, i) => (
              <div key={w.deviceId} className="flex justify-between items-center border border-gray-200 rounded-xl p-3">
                <div>
                  <p className="font-medium text-sm">{w.label || `Camera ${i + 1}`}</p>
                  <p className="text-xs text-gray-400">{w.deviceId.slice(0, 20)}...</p>
                </div>
                <button className="text-blue-600 hover:text-blue-800 text-sm font-medium inline-flex items-center gap-1 transition-colors" onClick={() => previewWebcam(w.deviceId)}>
                  <Eye size={14} />Preview
                </button>
              </div>
            ))}
          </div>
          {webcamPreview && (
            <div>
              <video ref={previewRef} autoPlay playsInline className="rounded-xl border border-gray-200 w-full" style={{ maxHeight: 300 }} />
              <button className="mt-2 text-sm text-red-500 hover:text-red-700 font-medium inline-flex items-center gap-1 transition-colors" onClick={stopPreview}>
                <Square size={14} />Stop Preview
              </button>
            </div>
          )}
        </GemCard>
      )}

      <GemCardBare>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-black/20 border-t-black rounded-full animate-spin" />
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center text-gray-400 py-8"><Camera size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No cameras configured</p></div>
        ) : (
          <div className="overflow-x-auto p-6">
            <GemTable
              headers={["Code", "Name", "Gate", "IP / Source", "Direction", "Protocol", "Confidence", "Status"]}
              rows={cameras.map(c => [
                <span className="font-bold">{c.code}</span>,
                c.name,
                <GemBadge>{c.gate_name || "-"}</GemBadge>,
                c.protocol === "webcam" ? <GemBadge variant="info">Built-in</GemBadge> : <span className="text-sm text-gray-400">{c.ip_address}:{c.port}</span>,
                <GemBadge variant="info">{c.direction}</GemBadge>,
                <GemBadge>{c.protocol}</GemBadge>,
                c.confidence_threshold ? `${c.confidence_threshold}%` : "-",
                statusBadge(c.status),
              ])}
            />
          </div>
        )}
      </GemCardBare>
    </GemPage>
  );
}
