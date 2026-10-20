import net from "node:net";
import pool from "@/lib/db";
import { withAuth, ok, err, notFound } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { logParkingAudit } from "@/lib/audit";

/**
 * POST /api/membership/parking/devices/:id/test
 * Honest reachability probe: TCP-connect to host:port (or HTTP GET for an
 * http/https endpoint). Reports exactly what happened — never fakes success.
 * When the device has no host configured the answer is explicitly
 * "unconfigured (simulated)".
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_devices");
    if (!perm.allowed) return err("Permission denied", 403);
    const { id } = await params;

    const res = await pool.query(
      `SELECT * FROM parking_devices WHERE id = $1 AND company_id = $2`,
      [Number(id), user.company_id]
    );
    const device = res.rows[0];
    if (!device) return notFound("Device");

    const started = Date.now();
    let result: { reachable: boolean; mode: string; message: string; latencyMs?: number };

    if (!device.host && !device.endpoint) {
      result = {
        reachable: false,
        mode: "unconfigured",
        message: `No host/endpoint configured for ${device.code}. The device is registered as simulated — configure its host or bridge endpoint to enable live communication.`,
      };
    } else if (device.endpoint && /^https?:\/\//i.test(device.endpoint)) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4000);
        const r = await fetch(device.endpoint, { signal: controller.signal });
        clearTimeout(t);
        result = {
          reachable: r.ok,
          mode: "http",
          message: r.ok ? `Endpoint responded ${r.status}` : `Endpoint responded with HTTP ${r.status}`,
          latencyMs: Date.now() - started,
        };
      } catch (e: any) {
        result = { reachable: false, mode: "http", message: `Endpoint unreachable — ${e.message}` };
      }
    } else if (device.host) {
      const port = Number(device.port) || (device.protocol === "rtsp" ? 554 : 80);
      result = await new Promise((resolve) => {
        const socket = new net.Socket();
        const done = (reachable: boolean, message: string) => {
          socket.destroy();
          resolve({ reachable, mode: "tcp", message, latencyMs: Date.now() - started });
        };
        socket.setTimeout(4000);
        socket.once("connect", () => done(true, `TCP connect succeeded to ${device.host}:${port}`));
        socket.once("timeout", () => done(false, `Timed out connecting to ${device.host}:${port} after 4s`));
        socket.once("error", (e: Error) => done(false, `Could not reach ${device.host}:${port} — ${e.message}`));
        socket.connect(port, device.host);
      });
    } else {
      result = { reachable: false, mode: "unconfigured", message: "Device has neither a resolvable host nor an endpoint" };
    }

    // Persist observed status honestly (online only when the probe succeeded).
    await pool.query(
      `UPDATE parking_devices SET status = $2, last_seen_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [device.id, result.reachable ? "online" : "offline", result.reachable ? new Date() : device.last_seen_at]
    );

    await logParkingAudit({
      user,
      action: "UPDATE",
      entity: "parking_device",
      entity_id: device.id,
      description: `Connectivity test: ${result.message}`,
      new_values: result,
      req,
    });

    return ok({ device_id: device.id, code: device.code, ...result });
  });
}
