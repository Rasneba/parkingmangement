import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const q = (query) => new Promise((r) => rl.question(query, r));

const CONTROLLER_IP = "192.168.0.68";
const CONTROLLER_PORT = 80;
const HRMS_API = await q("HRMS URL (e.g. https://your-app.vercel.app): ") || "http://localhost:3000";
const TOKEN = await q("JWT Token (from localStorage.token on HRMS site): ");
rl.close();

if (!TOKEN) { console.error("Token required"); process.exit(1); }

let lastEventId = "0";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchEventXml() {
  try {
    const res = await fetch(`http://${CONTROLLER_IP}:${CONTROLLER_PORT}/GEvent.xml?ID=${lastEventId}`, {
      signal: AbortSignal.timeout(3000),
    });
    const text = await res.text();
    const match = text.match(/<response>(.*?)<\/response>/);
    if (!match) return null;
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function openDoorOnController() {
  try {
    const url = `http://${CONTROLLER_IP}:${CONTROLLER_PORT}/cdor.cgi?open=1`;
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    console.log(`  => Door OPENED`);
  } catch (err) {
    console.log(`  => Door command failed: ${err.message}`);
  }
}

async function checkAccess(cardUid) {
  try {
    const res = await fetch(`${HRMS_API}/api/membership/parking/rfid-card-lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ card_uid: cardUid }),
      signal: AbortSignal.timeout(5000),
    });
    return await res.json();
  } catch (err) {
    console.log(`  API error: ${err.message}`);
    return null;
  }
}

console.log(`\nRelay started — polling ${CONTROLLER_IP} every 1s\n`);

while (true) {
  try {
    const event = await fetchEventXml();
    if (event && event.ID && event.ID !== lastEventId) {
      lastEventId = event.ID;
      console.log(`[${new Date().toLocaleTimeString()}] Event #${event.ID}: card=${event.Card}, note="${event.Note}"`);

      if (event.Note === "Invalid card" && event.Card) {
        console.log(`  → Checking ${event.Card} with HRMS...`);
        const result = await checkAccess(event.Card);
        if (result?.granted) {
          await openDoorOnController();
        } else {
          console.log(`  → Denied: ${result?.reason}`);
        }
      }
    }
  } catch {}

  await sleep(1000);
}
