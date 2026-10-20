import { withAuth, ok, err, forbidden } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

/**
 * Talks to the on-site access controller. Credentials must come from the
 * environment (never source code); the endpoint also requires an authenticated
 * user with device-view permission so the controller is not exposed publicly.
 */
function controllerConfig() {
  return {
    ip: (process.env.PARKING_CONTROLLER_IP || "").trim(),
    user: (process.env.PARKING_CONTROLLER_USER || "").trim(),
    password: process.env.PARKING_CONTROLLER_PASSWORD || "",
  };
}

function authHeader(user: string, password: string) {
  return {
    Authorization: "Basic " + Buffer.from(`${user}:${password}`).toString("base64"),
  };
}

export async function GET(req: Request) {
  return withAuth(req, async (authUser) => {
    const perm = await requirePermission(authUser, "view", "parking_devices");
    if (!perm.allowed) return forbidden();

    const cfg = controllerConfig();
    if (!cfg.ip || !cfg.user || !cfg.password) {
      return err("Controller is not configured", 503);
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const headers = authHeader(cfg.user, cfg.password);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      if (action === "ping") {
        const r = await fetch(`http://${cfg.ip}/Event.xml?ID=0`, {
          headers,
          signal: controller.signal,
        });
        return ok({ ok: r.ok });
      }

      if (action === "event") {
        const id = searchParams.get("ID") || "0";
        if (!/^\d+$/.test(id)) return err("Invalid event id", 400);
        const r = await fetch(`http://${cfg.ip}/Event.xml?ID=${id}`, {
          headers,
          signal: controller.signal,
        });
        const xml = await r.text();
        return ok({ ok: true, data: xml });
      }

      return ok({ ok: false, message: "Invalid action" });
    } catch (e: any) {
      const message = e?.name === "AbortError" ? "Controller timed out" : "Controller unreachable";
      return err(message, 502);
    } finally {
      clearTimeout(timeout);
    }
  });
}
