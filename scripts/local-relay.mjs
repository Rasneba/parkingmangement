import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import pg from "pg";

const DEFAULTS = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/genius_hrms",
  CONTROLLER_IP: "192.168.0.68",
  CONTROLLER_PORT: 80,
  CONTROLLER_USERNAME: "admin",
  CONTROLLER_PASSWORD: "888888",
};

function loadConfig() {
  for (const p of [".env.relay", join(homedir(), ".genius-relay.json")]) {
    if (existsSync(p)) {
      try {
        const fileCfg = JSON.parse(readFileSync(p, "utf8"));
        return { ...DEFAULTS, ...fileCfg };
      } catch { continue; }
    }
  }
  return { ...DEFAULTS };
}

const CFG = loadConfig();
const pool = new pg.Pool({ connectionString: CFG.DATABASE_URL });
const CONTROLLER = `http://${CFG.CONTROLLER_IP}:${CFG.CONTROLLER_PORT}`;
const CONTROLLER_AUTH = Buffer.from(`${CFG.CONTROLLER_USERNAME}:${CFG.CONTROLLER_PASSWORD}`).toString("base64");
const CONTROLLER_HEADERS = { Authorization: `Basic ${CONTROLLER_AUTH}` };
const FETCH_OPTS = { headers: CONTROLLER_HEADERS };

let lastEventId = "0";

async function query(sql, params = []) {
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } catch (e) {
    console.log(`  DB ERR: ${e.message}`);
    return null;
  }
}

async function controllerFetch(path) {
  const url = `${CONTROLLER}${path}`;
  try {
    const res = await fetch(url, { ...FETCH_OPTS });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function controllerCmd(path) {
  const url = `${CONTROLLER}${path}`;
  fetch(url, { method: "POST", ...FETCH_OPTS, signal: AbortSignal.timeout(10000) })
    .then(res => { console.log(`  CMD POST ${url} => ${res.status}`); })
    .catch(e => { console.log(`  CMD POST ${url} => ERR: ${e.message}`); });
}

async function openDoor() {
  controllerCmd("/cdor.cgi?open=1");
}

async function logAccess(cardUid, memberId, memberName, granted, reason, message, daysRemaining, doorOpened, extra = {}) {
  const cid = extra.company_id || CFG.COMPANY_ID || 1;
  await query(
    `INSERT INTO rfid_access_logs (company_id, card_uid, member_id, member_name, granted, reason, message, days_remaining, door_opened, direction, event_type, plan_name, subscription_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [cid, cardUid, memberId, memberName, granted, reason, message, daysRemaining, doorOpened,
     extra.direction || "IN", extra.event_type || "SWIPE", extra.plan_name || null, extra.subscription_id || null]
  );
}

async function toggleCheckin(memberId, cardUid, companyId) {
  if (!memberId) return;
  const cid = companyId || CFG.COMPANY_ID || 1;
  const existing = await query(
    `SELECT id FROM gym_checkins WHERE member_id = $1 AND status = 'checked_in' AND company_id = $2 LIMIT 1`,
    [memberId, cid]
  );
  if (existing && existing.length > 0) {
    await query(
      `UPDATE gym_checkins SET status = 'checked_out', check_out_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [existing[0].id]
    );
    console.log(`  CHECKOUT member_id=${memberId}`);
  } else {
    await query(
      `INSERT INTO gym_checkins (company_id, member_id, card_uid, status, source) VALUES ($1,$2,$3,'checked_in','rfid')`,
      [cid, memberId, cardUid]
    );
    console.log(`  CHECKIN member_id=${memberId}`);
  }
}

async function lookupCard(cardUid) {
  const rows = await query(
    `SELECT rc.id, rc.member_id, rc.card_uid, rc.label, rc.status, rc.company_id,
            mm.full_name AS member_name, mm.customer_id AS member_code, mm.company_id AS member_company_id
     FROM rfid_cards rc
     LEFT JOIN membership_members mm ON rc.member_id = mm.id
     WHERE rc.card_uid = $1 AND rc.status = 'active'`,
    [cardUid]
  );
  if (!rows || rows.length === 0) {
    await logAccess(cardUid, null, null, false, "CARD_NOT_FOUND", "RFID card not found in system", 0, false, { company_id: CFG.COMPANY_ID || 1 });
    return { granted: false, reason: "CARD_NOT_FOUND", message: "RFID card not found in system" };
  }

  const card = rows[0];
  const cid = CFG.COMPANY_ID || card.company_id || card.member_company_id || 1;

  if (!card.member_id) {
    await logAccess(cardUid, null, null, false, "CARD_NOT_ISSUED", "Card not issued to any member", 0, false, { company_id: cid });
    return { granted: false, reason: "CARD_NOT_ISSUED", message: "Card not issued to any member" };
  }

  const today = new Date().toISOString().split("T")[0];
  const subs = await query(
    `SELECT ps.id, ps.end_date, ps.plan_type, mp.name AS plan_name
     FROM parking_subscriptions ps
     LEFT JOIN membership_plans mp ON ps.plan_id = mp.id
     WHERE ps.customer_id = $1 AND ps.status IN ('active','pending') AND ps.start_date <= $2 AND ps.end_date >= $2
     ORDER BY ps.end_date DESC LIMIT 1`,
    [card.member_id, today]
  );

  if (!subs || subs.length === 0) {
    await logAccess(cardUid, card.member_id, card.member_name, false, "NO_ACTIVE_SUBSCRIPTION", "No active subscription covering today", 0, false, { company_id: cid });
    return { granted: false, reason: "NO_ACTIVE_SUBSCRIPTION", message: "No active subscription covering today", days_remaining: 0 };
  }

  const sub = subs[0];
  const daysRemaining = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000));

  await query("UPDATE rfid_cards SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1", [card.id]);
  await logAccess(cardUid, card.member_id, card.member_name, true, "ACCESS_GRANTED", "Access granted", daysRemaining, true,
    { company_id: cid, plan_name: sub.plan_name || null, subscription_id: sub.id, direction: "IN" });

  return {
    granted: true,
    reason: "ACCESS_GRANTED",
    message: "Access granted",
    member: { id: card.member_id, name: card.member_name },
    days_remaining: daysRemaining,
    company_id: cid,
  };
}

async function pollTasks() {
  const rows = await query(
    `UPDATE relay_commands SET status = 'running', updated_at = CURRENT_TIMESTAMP
     WHERE id = (
       SELECT id FROM relay_commands
       WHERE status = 'pending'
       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
     ) RETURNING *`
  );
  if (!rows || rows.length === 0) return;
  for (const task of rows) {
    console.log(`  TASK #${task.id}: ${task.action}`);
    if (task.action === "open_door") {
      await openDoor();
      const cid = task.company_id || CFG.COMPANY_ID || 1;
      await logAccess("BUTTON", null, null, true, "REMOTE_OPEN", "Door opened via button", 0, true, {
        company_id: cid, direction: "IN", event_type: "REMOTE_OPEN"
      });
    }
    await query(
      "UPDATE relay_commands SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [task.id]
    );
    console.log(`  TASK #${task.id} done`);
  }
}

async function pollEvents() {
  let raw = await controllerFetch(`/Event.xml?ID=${lastEventId}`);
  if (!raw) return;
  raw = raw.replace(/>\s+</g, "><").replace(/\s+/g, " ");
  const m = raw.match(/<response>(.*?)<\/response>/);
  if (!m) return;
  try {
    const ev = JSON.parse(m[1]);
    if (!ev.Card || !ev.ID) return;
    if (String(ev.ID) === String(lastEventId)) return;
    lastEventId = ev.ID;
    const cardUid = ev.Card;
    console.log(`  SWIPE card=${cardUid} id=${ev.ID} time=${ev.Time} reader=${ev.Reader || "?"}`);
    const lookup = await lookupCard(cardUid);
    if (lookup.granted) {
      console.log(`  GRANTED for ${lookup.member?.name || cardUid} (${lookup.days_remaining}d left)`);
      await openDoor();
      await toggleCheckin(lookup.member?.id, cardUid, lookup.company_id);
    } else {
      console.log(`  DENIED: ${lookup.reason} — ${lookup.message}`);
    }
  } catch {}
}

console.log("═".repeat(50));
console.log("  Genius HRMS — Offline Access Relay");
console.log("═".repeat(50));
console.log(`  DB:        ${CFG.DATABASE_URL.replace(/\/\/.*@/, "//user:pass@")}`);
console.log(`  Controller: ${CONTROLLER}`);
console.log(`  Company ID: ${CFG.COMPANY_ID || "not set"}`);
console.log("═".repeat(50));

console.log("  Testing controller...");
controllerFetch("/Event.xml?ID=0").then((r) => console.log(`  Controller: ${r ? "OK" : "no response"}`));

console.log("  Testing database...");
query("SELECT 1 AS ok").then((r) => console.log(`  Database: ${r ? "connected" : "FAILED"}`));

setInterval(pollTasks, 2000);
setInterval(pollEvents, 1000);
console.log("\n  Relay running (offline mode). Press Ctrl+C to stop.");
