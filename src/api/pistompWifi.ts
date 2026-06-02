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
