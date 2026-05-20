import {
  isModDesktopMode,
  isPiStompMode,
  RUNTIME_MODE_HEADER,
} from "../lib/runtimeMode";
import type {
  ConnectionMode,
  EffectPlugin,
  GlobalControl,
  PedalboardInfo,
  PedalboardSummary,
  SnapshotsMap,
} from "./types";

/** MOD host uses /graph/… paths on WebSocket; pedalboard/info uses short instance names. */
function normalizeWsInstance(raw: string): string {
  const s = raw.trim();
  return s.startsWith("/graph/") ? s.slice("/graph/".length) : s;
}

function wsPortPath(instance: string, port: string): string {
  const base = instance.startsWith("/graph/") ? instance : `/graph/${instance}`;
  return `${base}/${port}`;
}

const HOST_KEY = "pistomp-mobile-host";

/** Empty = same origin (recommended when served via nginx on the Pi). */
export function getHost(): string {
  return localStorage.getItem(HOST_KEY) ?? "";
}

export function setHost(host: string): void {
  localStorage.setItem(HOST_KEY, host.trim().replace(/\/$/, ""));
}

/** Wrong host (e.g. :80 while page is on :8080) breaks control — use same origin. */
export function fixHostForCurrentOrigin(): boolean {
  const host = getHost();
  if (!host) return false;
  try {
    if (new URL(host).origin !== window.location.origin) {
      localStorage.removeItem(HOST_KEY);
      return true;
    }
  } catch {
    localStorage.removeItem(HOST_KEY);
    return true;
  }
  return false;
}

function apiUrl(path: string): string {
  const base = getHost().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** Same host as the page — Vite proxies /websocket to MOD (avoids localhost → 127.0.0.1 failures). */
function wsUrlCandidates(): string[] {
  const host = getHost();
  if (host) {
    return [`${host.replace(/^http/, "ws").replace(/\/$/, "")}/websocket`];
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  /* MOD Desktop returns 403 for cross-origin WS; dev uses Vite proxy on same host. */
  return [`${proto}//${window.location.host}/websocket`];
}

/** Call after switching runtime mode so the next action opens a fresh socket. */
export function resetWebSocketConnection(): void {
  ws?.close();
  ws = null;
  wsConnectPromise = null;
  wsWarmAttempted = false;
}

export function isWebSocketOpen(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

/** Opens MOD WebSocket on first stomp/param — not at page load (avoids Vite ECONNRESET spam). */
function primeWebSocketForControl(): void {
  if (wsWarmAttempted && ws?.readyState === WebSocket.OPEN) return;
  wsWarmAttempted = true;
  void ensureWebSocket().catch(() => {
    wsWarmAttempted = false;
  });
}

/** Call when entering live mode so MOD Desktop changes stream in before the first tap. */
export function warmWebSocketForLiveSession(): void {
  primeWebSocketForControl();
}

export type ParamSetWsEvent =
  | { kind: "bypass"; instance: string; bypassed: boolean }
  | { kind: "param"; instance: string; port: string; value: number };

/**
 * MOD broadcasts `param_set /graph/larynx rate 0.1` (spaced) or `param_set /graph/larynx/rate 0.1` (slash).
 * Outgoing commands use the slash form with /graph/.
 */
export function parseParamSetWsMessage(msg: string): ParamSetWsEvent | null {
  if (!msg.startsWith("param_set ")) return null;
  const rest = msg.slice("param_set ".length).trim();

  const bypassSlash = rest.match(/^(.+?)\/:bypass\s+([\d.]+)/);
  if (bypassSlash) {
    return {
      kind: "bypass",
      instance: normalizeWsInstance(bypassSlash[1]),
      bypassed: Number(bypassSlash[2]) >= 0.5,
    };
  }
  const bypassSpaced = rest.match(/^(\S+)\s+:bypass\s+([\d.]+)/);
  if (bypassSpaced) {
    return {
      kind: "bypass",
      instance: normalizeWsInstance(bypassSpaced[1]),
      bypassed: Number(bypassSpaced[2]) >= 0.5,
    };
  }

  const slash = rest.match(/^(\S+?)\/([^/\s]+)\s+([\d.eE+-]+)/);
  if (slash) {
    const value = Number(slash[3]);
    if (!Number.isNaN(value)) {
      return {
        kind: "param",
        instance: normalizeWsInstance(slash[1]),
        port: slash[2],
        value,
      };
    }
  }

  const spaced = rest.match(/^(\S+)\s+(\S+)\s+([\d.eE+-]+)/);
  if (spaced && spaced[2] !== ":bypass") {
    const value = Number(spaced[3]);
    if (!Number.isNaN(value)) {
      return {
        kind: "param",
        instance: normalizeWsInstance(spaced[1]),
        port: spaced[2],
        value,
      };
    }
  }
  return null;
}

/** @deprecated Use parseParamSetWsMessage */
export function parseBypassWsMessage(msg: string): { instance: string; bypassed: boolean } | null {
  const ev = parseParamSetWsMessage(msg);
  if (ev?.kind === "bypass") return { instance: ev.instance, bypassed: ev.bypassed };
  return null;
}

/** MOD Desktop /pedalboard/info/ is disk metadata — keep live bypass/values from UI + WebSocket on refresh. */
export function mergePluginsPreservingLiveState(
  prev: EffectPlugin[],
  next: EffectPlugin[],
): EffectPlugin[] {
  if (!isModDesktopMode()) return next;
  return next.map((p) => {
    const was = prev.find((x) => x.instance === p.instance);
    if (!was) return p;
    return {
      ...p,
      bypassed: was.bypassed,
      ports: p.ports.map((pt) => {
        const live = was.ports.find((w) => w.symbol === pt.symbol);
        return live ? { ...pt, value: live.value } : pt;
      }),
    };
  });
}

/** `/pedalboard/info/` plugin order is not stable — keep grid order from the UI between polls. */
export function stabilizePluginOrder(
  prev: EffectPlugin[],
  next: EffectPlugin[],
): EffectPlugin[] {
  if (prev.length === 0) return next;
  const remaining = new Map(next.map((p) => [p.instance, p]));
  const ordered: EffectPlugin[] = [];
  for (const p of prev) {
    const fresh = remaining.get(p.instance);
    if (fresh) {
      ordered.push(fresh);
      remaining.delete(p.instance);
    }
  }
  for (const p of remaining.values()) {
    ordered.push(p);
  }
  return ordered;
}

/** Merge live MOD Desktop state and keep a stable stomp grid order after HTTP refresh. */
export function applyPluginsAfterRefresh(
  prev: EffectPlugin[],
  fromInfo: EffectPlugin[],
): EffectPlugin[] {
  return stabilizePluginOrder(prev, mergePluginsPreservingLiveState(prev, fromInfo));
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 6000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init?.headers);
    headers.set(RUNTIME_MODE_HEADER, isPiStompMode() ? "pistomp" : "modDesktop");
    const res = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
      headers,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- WebSocket (MOD uses this for bypass via host.bypass, not HTTP paramhmi_set) ---

type WSListener = (message: string) => void;

let ws: WebSocket | null = null;
let wsConnectPromise: Promise<WebSocket> | null = null;
let wsWarmAttempted = false;
const wsListeners = new Set<WSListener>();

function attachSocket(socket: WebSocket): void {
  socket.onmessage = (ev) => {
    const msg = String(ev.data);
    for (const fn of wsListeners) fn(msg);
  };
  socket.onclose = () => {
    ws = null;
    wsConnectPromise = null;
  };
}

function connectWebSocketOnce(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = window.setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket timeout"));
    }, 8000);

    const fail = () => {
      window.clearTimeout(timer);
      reject(new Error("WebSocket failed"));
    };

    socket.onopen = () => {
      window.clearTimeout(timer);
      ws = socket;
      attachSocket(socket);
      resolve(socket);
    };
    socket.onerror = fail;
    socket.onclose = () => {
      window.clearTimeout(timer);
      if (ws === socket) {
        ws = null;
      }
    };
  });
}

async function openWebSocketWithFallback(): Promise<WebSocket> {
  const urls = wsUrlCandidates();
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      return await connectWebSocketOnce(url);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("WebSocket failed");
    }
  }
  throw lastError ?? new Error("WebSocket failed");
}

function ensureWebSocket(): Promise<WebSocket> {
  if (ws?.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  if (wsConnectPromise) return wsConnectPromise;

  wsConnectPromise = openWebSocketWithFallback().finally(() => {
    if (ws?.readyState !== WebSocket.OPEN) {
      wsConnectPromise = null;
    }
  });

  return wsConnectPromise;
}

function sendWsParam(instance: string, portSymbol: string, value: number): Promise<void> {
  const port = wsPortPath(instance, portSymbol);
  return ensureWebSocket().then((socket) => {
    socket.send(`param_set ${port} ${value}`);
  });
}

export function connectWebSocket(onMessage: WSListener): () => void {
  wsListeners.add(onMessage);
  return () => {
    wsListeners.delete(onMessage);
  };
}

export async function testConnection(): Promise<boolean> {
  fixHostForCurrentOrigin();
  await request<PedalboardSummary[]>("/pedalboard/list");
  return true;
}

export async function listPedalboards(): Promise<PedalboardSummary[]> {
  return request<PedalboardSummary[]>("/pedalboard/list");
}

/** MOD expects /reset before load_bundle (see modep-ctrl) or plugins can stack. */
export async function resetSession(): Promise<void> {
  const res = await fetch(apiUrl("/reset/"));
  if (!res.ok) throw new Error(`reset failed: ${res.status}`);
}

export async function loadPedalboard(bundlepath: string): Promise<boolean> {
  await resetSession();
  const body = new FormData();
  body.append("bundlepath", bundlepath);
  const res = await fetch(apiUrl("/pedalboard/load_bundle/"), {
    method: "POST",
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { ok?: boolean };
  if (!data.ok) return false;
  await delay(450);
  return true;
}

/** MOD Desktop writes ~/Documents/MOD Desktop/last.json (dev-only via Vite). */
async function getCurrentFromModLastJson(): Promise<string | null> {
  if (!isModDesktopMode() || getHost()) return null;
  try {
    const res = await fetch("/mod-last.json");
    if (!res.ok) return null;
    const data = (await res.json()) as { pedalboard?: string };
    const bundle = data.pedalboard?.trim();
    return bundle && bundle.length > 0 ? bundle : null;
  } catch {
    return null;
  }
}

/** Currently loaded pedalboard bundle path (plain text), if supported. */
export async function getCurrentPedalboardBundle(): Promise<string | null> {
  if (isPiStompMode()) {
    try {
      const res = await fetch(apiUrl("/pedalboard/current"));
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text.length > 0 && !text.startsWith("<")) return text;
      }
    } catch {
      /* optional on some MOD builds */
    }
    return null;
  }
  return getCurrentFromModLastJson();
}

export async function resolveCurrentBundle(fallbackBundle: string): Promise<string> {
  return (await getCurrentPedalboardBundle()) ?? fallbackBundle;
}

export async function getPedalboardInfo(bundlepath: string): Promise<PedalboardInfo> {
  const q = new URLSearchParams({ bundlepath });
  const info = await request<PedalboardInfo>(`/pedalboard/info/?${q}`);
  info.plugins = await enrichPluginsWithColors(info.plugins);
  return info;
}

/** Loaded bundle + info; resolves current board via MOD API or last.json. */
export async function getLivePedalboardState(
  fallbackBundle: string,
): Promise<{ bundle: string; info: PedalboardInfo }> {
  const bundle = await resolveCurrentBundle(fallbackBundle);
  const info = await getPedalboardInfo(bundle);
  return { bundle, info };
}

/** Prefer live loaded bundle over disk-only info. */
export async function getLivePedalboardInfo(fallbackBundle: string): Promise<PedalboardInfo> {
  return (await getLivePedalboardState(fallbackBundle)).info;
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

async function setParameterViaHttp(
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

/** Pi-Stomp with real HMI can use HTTP when WebSocket is down; MOD Desktop cannot. */
function httpParamFallbackEnabled(): boolean {
  return isPiStompMode();
}

export async function setBypass(instance: string, bypassed: boolean): Promise<boolean> {
  const value = bypassed ? 1 : 0;
  try {
    await sendWsParam(instance, ":bypass", value);
    return true;
  } catch {
    if (!httpParamFallbackEnabled()) return false;
    return setParameterViaHttp(instance, ":bypass", value);
  }
}

export async function setParameter(
  instance: string,
  port: string,
  value: number,
): Promise<boolean> {
  try {
    await sendWsParam(instance, port, value);
    return true;
  } catch {
    if (!httpParamFallbackEnabled()) return false;
    return setParameterViaHttp(instance, port, value);
  }
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

export type { ConnectionMode };
