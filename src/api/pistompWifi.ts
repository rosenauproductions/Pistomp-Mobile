import { isPiStompMode } from "../lib/runtimeMode";

export type WifiMode = "hotspot" | "router" | "unknown";

export interface SavedWifiNetwork {
  name: string;
  ssid: string;
}

export interface WifiStatus {
  hotspotActive: boolean;
  mode: WifiMode;
  hotspotSsid: string;
  hotspotPassword?: string;
  ssid?: string;
  ipAddress?: string;
  connectionName?: string;
  savedNetworks?: SavedWifiNetwork[];
  error?: string;
}

export type WifiConfigureTarget = "hotspot" | "router";

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `/pistomp/wifi${p}`;
}

type WifiResult = { ok: boolean; status?: WifiStatus; error?: string };

async function postWifi(path: string, body: object): Promise<WifiResult> {
  if (!isPiStompMode()) {
    return { ok: false, error: "WiFi admin is only available on Pi-Stomp" };
  }
  try {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      status?: WifiStatus;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: data.ok !== false, status: data.status, error: data.error };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network request failed",
    };
  }
}

export async function fetchWifiStatus(): Promise<WifiStatus | null> {
  if (!isPiStompMode()) return null;
  try {
    const res = await fetch(apiUrl("/status"));
    if (!res.ok) return null;
    return (await res.json()) as WifiStatus;
  } catch {
    return null;
  }
}

export async function setWifiMode(mode: "hotspot" | "router"): Promise<WifiResult> {
  return postWifi("/mode", { mode });
}

export async function configureWifi(
  target: WifiConfigureTarget,
  ssid: string,
  password: string,
): Promise<WifiResult> {
  return postWifi("/configure", { target, ssid, password });
}

/** Same as pi-stomp LCD “System shutdown” — poweroff via root wifi API service. */
export async function requestPiShutdown(): Promise<{ ok: boolean; error?: string }> {
  if (!isPiStompMode()) {
    return { ok: false, error: "Shutdown is only available on Pi-Stomp" };
  }
  try {
    const res = await fetch(apiUrl("/shutdown"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
    if (res.status === 404) {
      return {
        ok: false,
        error:
          "Shutdown API missing — run update on the Pi (needs pistomp-wifi-api with /shutdown).",
      };
    }
    if (!res.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: data.ok !== false, error: data.error };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network request failed",
    };
  }
}

/** After POST /shutdown, poll until the Pi drops (success) or stays up (failure). */
export async function waitForPiPoweroff(
  timeoutMs = 12000,
): Promise<{ poweredOff: boolean; error?: string }> {
  const started = Date.now();
  let sawReachable = false;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const res = await fetch(apiUrl("/status"), { cache: "no-store" });
      if (res.ok) {
        sawReachable = true;
        continue;
      }
    } catch {
      // Network error = likely powered off (or WiFi dropped mid-shutdown).
      return { poweredOff: true };
    }
  }
  if (!sawReachable) {
    return { poweredOff: true };
  }
  return {
    poweredOff: false,
    error:
      "Pi is still running after shutdown request. Update on the Pi, then check QA → /pistomp/wifi/poweroff-log.",
  };
}
