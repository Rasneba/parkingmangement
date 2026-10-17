export interface AccessControllerConfig {
  ip: string;
  port?: number;
  openDoorPath?: string;
  openDoorParams?: Record<string, string>;
  method?: "GET" | "POST";
}

const DEFAULT_CONFIG: AccessControllerConfig = {
  ip: "192.168.0.68",
  port: 80,
  openDoorPath: "/cdor.cgi",
  openDoorParams: { open: "1", door: "0" },
  method: "GET",
};

export async function openDoor(
  config: AccessControllerConfig = DEFAULT_CONFIG
): Promise<{ success: boolean; message: string }> {
  const { ip, port = 80, openDoorPath = "/Control.htm", openDoorParams = { OpenDoor: "1", DoorID: "0" }, method = "GET" } = config;

  const base = `http://${ip}:${port}`;
  const url = new URL(openDoorPath, base);
  for (const [k, v] of Object.entries(openDoorParams)) {
    url.searchParams.set(k, v);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url.toString(), {
      method,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      return { success: true, message: `Door opened at ${ip}` };
    }
    return { success: false, message: `Controller returned status ${res.status}` };
  } catch (err: any) {
    return { success: false, message: `Failed to reach controller at ${ip}:${port} — ${err.message}` };
  }
}
