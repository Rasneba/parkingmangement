import { NextResponse } from "next/server";
import { completeAddisPayPayment } from "@/lib/addispay-complete";

/**
 * GET /api/membership/parking/addispay/callback
 * Browser redirect target used by the AddisPay gateway after checkout. It is
 * unauthenticated (the reference is an unguessable tx_ref) and always ends by
 * redirecting the customer back into the app.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const txRef = searchParams.get("tx_ref");
  const sessionId = searchParams.get("session_id");
  const returnUrl = searchParams.get("return_url");

  if (!txRef) {
    return NextResponse.json({ error: "Missing tx_ref" }, { status: 400 });
  }

  try {
    const res = await completeAddisPayPayment(txRef);
    const base =
      returnUrl && returnUrl.startsWith("/")
        ? returnUrl
        : `/dashboard/membership/parking/exit${sessionId ? `?session=${sessionId}` : ""}`;
    const url = new URL(base, req.url);
    url.searchParams.set("addispay", res.status === "success" ? "success" : res.status);
    if (sessionId) url.searchParams.set("session", sessionId);
    return NextResponse.redirect(url);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
