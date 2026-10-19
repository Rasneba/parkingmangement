import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { completeAddisPayPayment } from "@/lib/addispay-complete";

/** GET /api/membership/parking/addispay/verify/:tx_ref - poll a checkout's status. */
export async function GET(req: Request, { params }: { params: Promise<{ tx_ref: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { tx_ref } = await params;
  try {
    const result = await completeAddisPayPayment(tx_ref, user.company_id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
