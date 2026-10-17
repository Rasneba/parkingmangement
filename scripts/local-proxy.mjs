// Local proxy — bridges browser <-> access controller (solves CORS)
// Run: node scripts/local-proxy.mjs [apiUrl] [token]
//   apiUrl defaults to http://localhost:3000
//   token defaults to "" (set in the UI)
// Then open: http://localhost:3001

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, ".proxy-config.json");

const CONTROLLER = "192.168.0.68";
const PORT = 3001;
const CONTROLLER_AUTH = "admin:888888";
const CONTROLLER_AUTH_B64 = Buffer.from(CONTROLLER_AUTH).toString("base64");

// Load or parse config
function loadConfig() {
  const fromArgs = { apiUrl: process.argv[2] || null, token: process.argv[3] || null };
  const fromFile = {};
  try { Object.assign(fromFile, JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"))); } catch {}
  if (fromArgs.apiUrl || fromArgs.token) {
    const merged = { ...fromFile, ...fromArgs };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
    return merged;
  }
  return fromFile;
}

const cfg = loadConfig();
const DEFAULT_API_URL = cfg.apiUrl || "http://localhost:3000";
const DEFAULT_TOKEN = cfg.token || "";

const server = http.createServer((req, res) => {
  // CORS headers for the browser page
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve the console page
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Access Control Console</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',sans-serif; }
  body { background:#0f172a; color:#e2e8f0; display:flex; min-height:100vh; }
  .sidebar { width:280px; background:#1e293b; padding:24px; border-right:1px solid #334155; }
  .sidebar h2 { font-size:14px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:16px; }
  .sidebar .info { font-size:13px; margin-bottom:8px; }
  .sidebar .info span { color:#94a3b8; }
  .status-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }
  .status-dot.online { background:#22c55e; }
  .status-dot.offline { background:#ef4444; }
  .main { flex:1; padding:32px; display:flex; flex-direction:column; }
  .header { margin-bottom:24px; }
  .header h1 { font-size:24px; font-weight:700; }
  .header p { color:#64748b; font-size:14px; }
  .card { background:#1e293b; border-radius:12px; padding:32px; margin-bottom:16px; border:1px solid #334155; }
  .waiting { text-align:center; padding:60px 20px; }
  .waiting .icon { font-size:64px; margin-bottom:16px; opacity:0.5; }
  .waiting h3 { font-size:20px; color:#94a3b8; }
  .waiting p { color:#64748b; margin-top:8px; }
  .event { display:flex; align-items:center; gap:16px; padding:16px; border-radius:8px; margin-bottom:8px; }
  .event.granted { background:#052e16; border:1px solid #166534; }
  .event.denied { background:#450a0a; border:1px solid #991b1b; }
  .event .uid { font-family:monospace; font-size:18px; font-weight:700; }
  .event .name { font-size:14px; color:#cbd5e1; }
  .event .time { font-size:12px; color:#64748b; }
  .event .badge { padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
  .badge.granted { background:#22c55e; color:#052e16; }
  .badge.denied { background:#ef4444; color:#450a0a; }
  .log { margin-top:auto; border-top:1px solid #334155; padding-top:16px; }
  .log-entry { font-size:12px; color:#64748b; font-family:monospace; margin-bottom:4px; }
  .config-section { margin-bottom:24px; }
  .config-section label { font-size:12px; color:#94a3b8; display:block; margin-bottom:4px; }
  .config-section input { width:100%; padding:8px 12px; background:#0f172a; border:1px solid #334155; border-radius:6px; color:#e2e8f0; font-size:13px; margin-bottom:8px; }
  .config-section button { background:#3b82f6; color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:13px; }
  .config-section button:hover { background:#2563eb; }
  .event-list { max-height:400px; overflow-y:auto; }
</style>
</head>
<body>
<div class="sidebar">
  <h2>Access Controller</h2>
  <div class="info"><span id="ctrlStatus" class="status-dot offline"></span>Controller: ${CONTROLLER}</div>
  <div class="info">Last Seen: <span id="lastSeen">—</span></div>
  <hr style="border-color:#334155;margin:16px 0">
  <h2>HRMS Connection</h2>
  <div class="config-section">
    <label>API URL</label>
    <input type="text" id="apiUrl" placeholder="http://localhost:3000" value="${DEFAULT_API_URL}">
    <label>Token</label>
    <input type="password" id="apiToken" placeholder="JWT token" value="${DEFAULT_TOKEN}">
    <button onclick="saveConfig()">Save & Connect</button>
    <div id="hrmsStatus" style="margin-top:8px;font-size:12px;color:#64748b">Not configured</div>
  </div>
  <hr style="border-color:#334155;margin:16px 0">
  <h2>Log</h2>
  <div id="logContainer" style="font-size:11px;color:#64748b;font-family:monospace;max-height:200px;overflow-y:auto"></div>
</div>
<div class="main">
  <div class="header">
    <h1>Door Access Console</h1>
    <p>Present an RFID card to the reader</p>
  </div>
  <div id="waitingScreen" class="card waiting">
    <div class="icon">🏛️</div>
    <h3>Waiting for card...</h3>
    <p>Present RFID card to the reader at the gate</p>
  </div>
  <div id="resultScreen" class="card" style="display:none">
    <div id="eventDisplay" class="event">
      <div style="flex:1"><div class="uid" id="resultUid"></div><div class="name" id="resultName"></div><div class="time" id="resultTime"></div></div>
      <div><div class="badge" id="resultBadge"></div><div style="font-size:12px;color:#64748b;margin-top:4px;text-align:center" id="resultSub"></div></div>
    <div style="font-size:12px;color:#22c55e;font-weight:600" id="resultDays"></div>
    </div>
    <div style="margin-top:16px;font-size:13px;color:#94a3b8" id="resultDetail"></div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:14px;color:#94a3b8">Swipe History</h3>
      <span style="font-size:12px;color:#64748b" id="historyCount">0 events</span>
    </div>
    <div id="historyList" class="event-list">
      <div style="text-align:center;padding:20px;color:#64748b;font-size:13px">No events yet</div>
    </div>
  </div>
</div>
<script>
const CONFIG_KEY = "accessProxyConfig";
const PROXY = "";
let config = { apiUrl: "", token: "" };
let lastEventId = "0";
let pollTimer = null;

function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) config = JSON.parse(saved);
    document.getElementById("apiUrl").value = config.apiUrl || "http://localhost:3000";
    document.getElementById("apiToken").value = config.token || "";
  } catch {}
}

function saveConfig() {
  config.apiUrl = document.getElementById("apiUrl").value.trim();
  config.token = document.getElementById("apiToken").value.trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  document.getElementById("hrmsStatus").textContent = config.apiUrl && config.token ? "Connected" : "Not configured";
  document.getElementById("hrmsStatus").style.color = config.apiUrl && config.token ? "#22c55e" : "#64748b";
  if (config.apiUrl && config.token) startPolling();
}

function log(msg) {
  const el = document.getElementById("logContainer");
  const t = new Date().toLocaleTimeString();
  el.innerHTML = "<div>" + t + " " + msg + "</div>" + el.innerHTML;
  if (el.children.length > 50) el.removeChild(el.lastChild);
}

function addHistory(ev) {
  const list = document.getElementById("historyList");
  const empty = list.querySelector("div:only-child");
  if (empty && empty.textContent === "No events yet") list.innerHTML = "";
  const div = document.createElement("div");
  div.className = "event " + (ev.granted ? "granted" : "denied");
  div.innerHTML = '<div style="flex:1"><div class="uid">' + ev.cardUid + '</div><div class="name">' + (ev.memberName || "Unknown") + '</div><div class="time">' + ev.time + '</div></div><div style="text-align:right"><span class="badge ' + (ev.granted ? "granted" : "denied") + '">' + (ev.granted ? "GRANTED" : ev.reason) + '</span>' + (ev.daysRemaining != null ? '<div style="font-size:11px;color:#22c55e;margin-top:2px">' + ev.daysRemaining + 'd left</div>' : '') + '</div>';
  list.insertBefore(div, list.firstChild);
  document.getElementById("historyCount").textContent = list.children.length + " events";
}

function showResult(ev) {
  document.getElementById("waitingScreen").style.display = "none";
  document.getElementById("resultScreen").style.display = "block";
  document.getElementById("resultUid").textContent = ev.cardUid;
  document.getElementById("resultName").textContent = ev.memberName || "Unknown card";
  document.getElementById("resultTime").textContent = ev.time;
  const badge = document.getElementById("resultBadge");
  const sub = document.getElementById("resultSub");
  const detail = document.getElementById("resultDetail");
  if (ev.granted) {
    badge.textContent = "ACCESS GRANTED"; badge.className = "badge granted";
    sub.textContent = "Door opened"; detail.textContent = ev.doorMsg || "";
    document.getElementById("eventDisplay").className = "event granted";
    document.getElementById("resultDays").textContent = ev.daysRemaining != null ? ev.daysRemaining + " days remaining" : "";
  } else {
    badge.textContent = "DENIED"; badge.className = "badge denied";
    sub.textContent = ev.reason; detail.textContent = ev.detail || "";
    document.getElementById("eventDisplay").className = "event denied";
  }
  setTimeout(() => {
    document.getElementById("waitingScreen").style.display = "block";
    document.getElementById("resultScreen").style.display = "none";
  }, 5000);
}

async function checkController() {
  try {
    const r = await fetch("/ping", { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      document.getElementById("ctrlStatus").className = "status-dot online";
      document.getElementById("lastSeen").textContent = new Date().toLocaleTimeString();
      return true;
    }
  } catch {}
  document.getElementById("ctrlStatus").className = "status-dot offline";
  return false;
}

async function fetchEvent() {
  try {
    const r = await fetch("/event", { signal: AbortSignal.timeout(2000) });
    return await r.json();
  } catch { return null; }
}

async function openDoorCtrl() {
  try {
    const r = await fetch("/open-door", { signal: AbortSignal.timeout(2000) });
    const data = await r.json();
    return data.message;
  } catch (err) { return "Failed: " + err.message; }
}

async function checkHrms(cardUid) {
  try {
    const r = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_uid: cardUid, apiUrl: config.apiUrl, token: config.token }),
      signal: AbortSignal.timeout(5000),
    });
    return await r.json();
  } catch (err) { return null; }
}

async function pollEvents() {
  const event = await fetchEvent();
  if (!event || !event.ID || event.ID === lastEventId) return;
  lastEventId = event.ID;
  log("Event #" + event.ID + ": card=" + event.Card + ' note="' + event.Note + '"');
  if (!event.Card) return;
  const time = new Date().toLocaleString();
  const cardUid = event.Card;
  log("Checking " + cardUid + "...");
  const result = await checkHrms(cardUid);
  if (result && result.granted) {
    log("Access GRANTED - opening door");
    const doorMsg = await openDoorCtrl();
    addHistory({ cardUid, memberName: result.member?.name, time, granted: true, reason: "ACCESS_GRANTED", doorMsg, daysRemaining: result.days_remaining });
    showResult({ cardUid, memberName: result.member?.name, time, granted: true, doorMsg, daysRemaining: result.days_remaining });
  } else {
    const reason = result?.reason || "NO_RESPONSE";
    log("Access DENIED - " + reason);
    addHistory({ cardUid, memberName: result?.member?.name, time, granted: false, reason, daysRemaining: result?.days_remaining });
    showResult({ cardUid, memberName: result?.member?.name, time, granted: false, reason, detail: result?.message, daysRemaining: result?.days_remaining });
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollEvents, 1000);
  document.getElementById("hrmsStatus").textContent = "Polling events...";
  document.getElementById("hrmsStatus").style.color = "#22c55e";
  log("Started");
}

loadConfig();
if (config.apiUrl && config.token) saveConfig();
setInterval(checkController, 5000);
checkController();
</script>
</body>
</html>`;
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  // Proxy HRMS lookup (avoids CORS from browser)
  if (url.pathname === "/api/lookup" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      const { card_uid, apiUrl, token } = JSON.parse(body);
      const baseUrl = apiUrl || cfg.apiUrl;
      const authToken = token || cfg.token;
      try {
        const apiRes = await fetch(baseUrl + "/api/membership/parking/rfid-card-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
          body: JSON.stringify({ card_uid }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await apiRes.json();
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ granted: false, reason: "PROXY_ERROR", message: err.message }));
      }
    });
    return;
  }

  // Proxy to controller
  let targetPath = "";
  if (url.pathname === "/ping") targetPath = "/index.htm";
  else if (url.pathname === "/event") targetPath = "/Event.xml?ID=" + (url.searchParams.get("ID") || "0");
  else if (url.pathname === "/open-door") targetPath = "/cdor.cgi?open=1";
  else {
    res.writeHead(404);
    return res.end("Not found");
  }

  let responded = false;
  function respond(status, data) {
    if (responded) return;
    responded = true;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  const options = {
    hostname: CONTROLLER,
    port: 80,
    path: targetPath,
    method: "GET",
    timeout: 5000,
    headers: { Authorization: "Basic " + CONTROLLER_AUTH_B64 },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let body = "";
    proxyRes.on("data", (chunk) => { body += chunk; });
    proxyRes.on("end", () => {
      if (url.pathname === "/event") {
        // Parse Event.xml response
        const match = body.match(/<response>(.*?)<\/response>/);
        if (match) return respond(200, JSON.parse(match[1]));
        return respond(200, {});
      }
      respond(200, { ok: true, message: "Door command sent" });
    });
  });

  proxyReq.on("error", (err) => {
    respond(200, { ok: false, message: err.message });
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    respond(200, { ok: false, message: "Timeout" });
  });

  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`\nAccess Control Console running at:`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`Make sure your Next.js dev server is running on localhost:3000`);
  console.log(`The controller at ${CONTROLLER} will be proxied through this server.`);
  console.log(`\nTip: pass API URL and token as arguments to save them:`);
  console.log(`  node scripts/local-proxy.mjs http://localhost:3000 YOUR_TOKEN_HERE\n`);
});
