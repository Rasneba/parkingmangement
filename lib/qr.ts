import QRCode from "qrcode";

export interface TicketQrPayload {
  type: "parking_ticket";
  session_id: number;
  ticket_number: string;
  plate_number: string | null;
  company_id: number;
  entry_time: string;
}

/** Returns a PNG data URL (safe to embed in an <img src>). */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width: 320 });
}

/** Returns an inline SVG string (useful for thermal receipts). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
}

export function buildTicketPayload(session: {
  id: number;
  ticket_number: string | null;
  plate_number: string | null;
  company_id: number;
  entry_time: string | Date;
}): TicketQrPayload {
  return {
    type: "parking_ticket",
    session_id: session.id,
    ticket_number: session.ticket_number || "",
    plate_number: session.plate_number,
    company_id: session.company_id,
    entry_time:
      session.entry_time instanceof Date
        ? session.entry_time.toISOString()
        : String(session.entry_time),
  };
}

/** Extracts a session id from scanned QR text (JSON payload or plain number/id). */
export function parseScannedQr(raw: string): { session_id?: number; ticket_number?: string } | null {
  if (!raw) return null;
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return {
        session_id: parsed.session_id ? Number(parsed.session_id) : undefined,
        ticket_number: parsed.ticket_number ? String(parsed.ticket_number) : undefined,
      };
    }
  } catch {
    // not JSON, fall through
  }
  const digits = text.replace(/\D/g, "");
  if (digits) return { session_id: Number(digits) };
  return { ticket_number: text };
}
