export interface TicketImageInput {
  companyName?: string | null;
  ticketNumber: string;
  plateNumber: string;
  space?: string | null;
  entryTime: string;
  qrDataUrl: string;
  footer?: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("QR image failed to load"));
    img.src = src;
  });
}

/** Renders a printable/shareable PNG ticket (QR + stay details) entirely client-side. */
export async function renderTicketImage(input: TicketImageInput): Promise<Blob> {
  const W = 760;
  const H = 1040;
  const scale = 2;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 30px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(input.companyName || "PARKING", W / 2, 84);
  ctx.fillStyle = "#475569";
  ctx.font = "600 20px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("PARKING TICKET", W / 2, 116);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 140);
  ctx.lineTo(W - 48, 140);
  ctx.stroke();

  const qr = await loadImage(input.qrDataUrl);
  const qrSize = 420;
  const qrX = (W - qrSize) / 2;
  const qrY = 172;
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 40px 'Consolas', 'Courier New', monospace";
  ctx.fillText(input.ticketNumber, W / 2, qrY + qrSize + 72);

  const rows: Array<[string, string]> = [
    ["Plate", input.plateNumber],
    ["Space", input.space || "-"],
    ["Entry", input.entryTime],
  ];
  let y = qrY + qrSize + 128;
  for (const [k, v] of rows) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "500 18px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(k, 64, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(String(v), W - 64, y);
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, y + 14);
    ctx.lineTo(W - 64, y + 14);
    ctx.stroke();
    y += 52;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 15px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(input.footer || "Keep this ticket. Pay at the exit station before leaving.", W / 2, H - 52);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render ticket image"))), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Uses the Web Share API (mobile "Save image"/gallery) when available, otherwise downloads. */
export async function shareOrDownload(blob: Blob, filename: string, text: string): Promise<"shared" | "downloaded"> {
  try {
    const file = new File([blob], filename, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: "Parking ticket", text });
      return "shared";
    }
  } catch {
    // cancelled or unsupported - fall back to a download
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

export function ticketFileName(ticketNumber: string): string {
  return `parking-ticket-${ticketNumber || Date.now()}.png`;
}
