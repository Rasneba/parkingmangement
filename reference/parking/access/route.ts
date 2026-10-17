import { NextResponse } from "next/server";

const CONTROLLER_IP = "192.168.0.68";
const USER = "admin";
const PASSWORD = "888888";

function authHeader() {
  return {
    Authorization:
      "Basic " +
      Buffer.from(`${USER}:${PASSWORD}`).toString("base64"),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    // TEST CONNECTION
    if (action === "ping") {
      const r = await fetch(`http://${CONTROLLER_IP}/Event.xml?ID=0`, {
        headers: authHeader(),
      });
      return NextResponse.json({ ok: r.ok });
    }

    // LIVE EVENT
    if (action === "event") {
      const id = searchParams.get("ID") || "0";
      const r = await fetch(`http://${CONTROLLER_IP}/Event.xml?ID=${id}`, {
        headers: authHeader(),
      });
      const xml = await r.text();
      return NextResponse.json({ ok: true, data: xml });
    }

    return NextResponse.json({ ok: false, message: "Invalid action" });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
