import type {
  ConnectionMode,
  EffectPlugin,
  GlobalControl,
  PedalboardInfo,
  PedalboardSummary,
  SnapshotsMap,
} from "./types";

const HOST_KEY = "pistomp-mobile-host";

/** Empty = same origin (recommended when served via nginx on the Pi). */
export function getHost(): string {
  return localStorage.getItem(HOST_KEY) ?? "";
}

export function setHost(host: string): void {
  localStorage.setItem(HOST_KEY, host.trim().replace(/\/$/, ""));
}

function apiUrl(path: string): string {
  const base = getHost().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 6000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(): Promise<boolean> {
  await request<PedalboardSummary[]>("/pedalboard/list");
  return true;
}

export async function listPedalboards(): Promise<PedalboardSummary[]> {
  return request<PedalboardSummary[]>("/pedalboard/list");
}

export async function loadPedalboard(bundlepath: string): Promise<boolean> {
  const body = new FormData();
  body.append("bundlepath", bundlepath);
  const res = await fetch(apiUrl("/pedalboard/load_bundle/"), {
    method: "POST",
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { ok?: boolean };
  return Boolean(data.ok);
}

export async function getPedalboardInfo(bundlepath: string): Promise<PedalboardInfo> {
  const q = new URLSearchParams({ bundlepath });
  const info = await request<PedalboardInfo>(`/pedalboard/info/?${q}`);
  info.plugins = await enrichPluginsWithColors(info.plugins);
  return info;
}

interface PluginMeta {
  color?: string;
}

const pluginColorCache = new Map<string, string | undefined>();

async function fetchPluginColor(uri: string): Promise<string | undefined> {
  if (pluginColorCache.has(uri)) return pluginColorCache.get(uri);
  try {
    const q = new URLSearchParams({ uri });
    const meta = await request<PluginMeta>(`/effect/get?${q}`);
    const color = typeof meta.color === "string" ? meta.color : undefined;
    pluginColorCache.set(uri, color);
    return color;
  } catch {
    pluginColorCache.set(uri, undefined);
    return undefined;
  }
}

export async function enrichPluginsWithColors(
  plugins: EffectPlugin[],
): Promise<EffectPlugin[]> {
  const uris = [...new Set(plugins.map((p) => p.uri).filter(Boolean) as string[])];
  await Promise.all(uris.map((uri) => fetchPluginColor(uri)));
  return plugins.map((p) =>
    p.uri && pluginColorCache.get(p.uri)
      ? { ...p, color: pluginColorCache.get(p.uri) }
      : p,
  );
}

export async function setBypass(instance: string, bypassed: boolean): Promise<boolean> {
  const payload = JSON.stringify(`unused/${instance}/:bypass/${bypassed ? 1 : 0}`);
  const res = await fetch(apiUrl("/effect/parameter/set/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  if (!res.ok) return false;
  const ok = await res.json();
  return ok === true || ok === "true";
}

export async function setParameter(
  instance: string,
  port: string,
  value: number,
): Promise<boolean> {
  const payload = JSON.stringify(`unused/${instance}/${port}/${value}`);
  const res = await fetch(apiUrl("/effect/parameter/set/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  if (!res.ok) return false;
  const ok = await res.json();
  return ok === true || ok === "true";
}

export async function listSnapshots(): Promise<SnapshotsMap> {
  return request<SnapshotsMap>("/snapshot/list");
}

export async function savePedalboard(title: string, asNew = false): Promise<boolean> {
  const body = new FormData();
  body.append("title", title);
  body.append("asNew", asNew ? "1" : "0");
  const res = await fetch(apiUrl("/pedalboard/save"), { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { ok?: boolean };
  return Boolean(data.ok);
}

export async function saveSnapshot(): Promise<boolean> {
  const res = await fetch(apiUrl("/snapshot/save"), { method: "POST" });
  if (!res.ok) return false;
  const ok = await res.json();
  return ok === true || ok === "true";
}

/** Ports exposed in the per-effect settings sheet (not bypass/preset meta). */
export function getEditablePorts(ports: EffectPlugin["ports"]): EffectPlugin["ports"] {
  return ports.filter(
    (p) =>
      p.valid !== false &&
      p.symbol.length > 0 &&
      !p.symbol.startsWith(":"),
  );
}

export async function loadSnapshot(id: number): Promise<boolean> {
  const q = new URLSearchParams({ id: String(id) });
  const res = await fetch(apiUrl(`/snapshot/load?${q}`));
  if (!res.ok) return false;
  const ok = await res.json();
  return ok === true || ok === "true";
}

const GLOBAL_MATCHERS: {
  kind: GlobalControl["kind"];
  label: string;
  test: (p: EffectPlugin) => boolean;
  portPreference: string[];
}[] = [
  {
    kind: "gain",
    label: "Gain",
    test: (p) =>
      !isTunerPlugin(p) &&
      (/^gain$/i.test(p.instance) ||
        /\/Gain$/i.test(p.uri ?? "") ||
        /gain/i.test(p.title ?? "")),
    portPreference: ["Gain", "Level", "Volume"],
  },
  {
    kind: "master",
    label: "Master",
    test: (p) =>
      /master/i.test(p.instance) ||
      /master|volume/i.test(p.uri ?? "") ||
      /master|volume/i.test(p.title ?? ""),
    portPreference: ["Volume", "Level", "Gain", "Master"],
  },
];

export function extractGlobalControls(plugins: EffectPlugin[]): GlobalControl[] {
  const controls: GlobalControl[] = [];

  for (const matcher of GLOBAL_MATCHERS) {
    const plugin = plugins.find(matcher.test);
    if (!plugin || plugin.ports.length === 0) continue;

    const port =
      plugin.ports.find((p) => matcher.portPreference.includes(p.symbol)) ??
      plugin.ports[0];

    controls.push({
      kind: matcher.kind,
      label: matcher.label,
      instance: plugin.instance,
      port: port.symbol,
      value: port.value,
      min: 0,
      max: 1,
    });
  }

  return controls;
}

function isTunerPlugin(p: EffectPlugin): boolean {
  return (
    /tun/i.test(p.instance) ||
    /tun/i.test(p.uri ?? "") ||
    /tun/i.test(p.title ?? "")
  );
}

export function connectWebSocket(onReload: () => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;

  const wsUrl = (): string => {
    const host = getHost();
    if (host) {
      return `${host.replace(/^http/, "ws").replace(/\/$/, "")}/websocket`;
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/websocket`;
  };

  const open = () => {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl());
      ws.onmessage = (ev) => {
        const msg = String(ev.data);
        if (
          msg.includes("load-pb") ||
          msg.includes("bypass") ||
          msg.includes("snapshot") ||
          msg.includes("param")
        ) {
          onReload();
        }
      };
      ws.onclose = () => {
        if (!closed) setTimeout(open, 3000);
      };
    } catch {
      setTimeout(open, 3000);
    }
  };

  open();
  return () => {
    closed = true;
    ws?.close();
  };
}

export type { ConnectionMode };
