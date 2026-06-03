import {
  isModDesktopMode,
  isPiStompMode,
  RUNTIME_MODE_HEADER,
} from "../lib/runtimeMode";
import {
  enrichPluginPortRanges,
  findNativeBypassPort,
  nativeBypassValueForTarget,
  normalizePluginPorts,
} from "./portUtils";
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

function instanceKey(raw: string): string {
  return normalizeWsInstance(raw).replace(/^\//, "").toLowerCase();
}

/** Match pedalboard/info `instance` to WS `/graph/…` paths. */
export function instanceIdsMatch(a: string, b: string): boolean {
  return instanceKey(a) === instanceKey(b);
}

const bypassEchoSuppress = new Map<string, { until: number; bypassed: boolean }>();

export function noteBypassCommand(instance: string, bypassed: boolean): void {
  bypassEchoSuppress.set(instanceKey(instance), {
    until: Date.now() + 1200,
    bypassed,
  });
}

function shouldApplyInboundBypass(instance: string, bypassed: boolean): boolean {
  const pending = bypassEchoSuppress.get(instanceKey(instance));
  if (!pending || Date.now() > pending.until) return true;
  if (pending.bypassed === bypassed) {
    bypassEchoSuppress.delete(instanceKey(instance));
    return true;
  }
  return false;
}

/** Avoid full disk refresh on unrelated WS traffic (e.g. paths containing "pedalboard"). */
export function shouldReloadBoardFromWs(msg: string): boolean {
  const t = msg.trim();
  return (
    t.startsWith("load-pb") ||
    t.startsWith("reload-pb") ||
    t.startsWith("snapshot/load") ||
    t.startsWith("snapshot-save")
  );
}

/** Pi-Stomp pi_stomp_set URLs use //graph{instance_id}/… where instance_id is e.g. /CollisionDrive. */
function piStompInstanceSuffix(instance: string): string {
  const s = instance.trim();
  if (s.startsWith("/graph/")) return s.slice("/graph".length);
  return s.startsWith("/") ? s : `/${s}`;
}

function piStompSetPaths(instance: string, port: string): string[] {
  const suffix = piStompInstanceSuffix(instance);
  const sym = port.startsWith(":") ? port : port.replace(/^\//, "");
  const base = `/effect/parameter/pi_stomp_set`;
  return [
    `${base}//graph${suffix}/${sym}`,
    `${base}/graph${suffix}/${sym}`,
    `${base}//graph${suffix}/${port}`,
  ];
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

type WsStatusListener = (open: boolean) => void;
const wsStatusListeners = new Set<WsStatusListener>();

function notifyWebSocketStatus(): void {
  const open = isWebSocketOpen();
  for (const fn of wsStatusListeners) fn(open);
}

/** Subscribe to MOD WebSocket open/close (for connection indicator). */
export function onWebSocketStatus(listener: WsStatusListener): () => void {
  wsStatusListeners.add(listener);
  listener(isWebSocketOpen());
  return () => wsStatusListeners.delete(listener);
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

/** Await MOD WebSocket (Pi needs this before controls work). */
export async function ensureWebSocketReady(): Promise<boolean> {
  try {
    await ensureWebSocket();
    return true;
  } catch (e) {
    pushControlLog(`WebSocket connect failed: ${e instanceof Error ? e.message : String(e)}`);
    wsWarmAttempted = false;
    return false;
  }
}

/**
 * Pi `/pedalboard/current` is often empty even when the UI bundle exists on disk.
 * Always reset+load so MOD host graph matches the app (avoids pi_stomp_set 500 / dead controls).
 */
export async function syncHostPedalboard(bundlepath: string): Promise<boolean> {
  if (!bundlepath) return false;
  pushControlLog(`sync host load_bundle ${bundlepath}`);
  return loadPedalboard(bundlepath);
}

/** Quick check: host graph has at least one plugin (pi_stomp_set works). */
export async function probeHostGraphReady(instance: string, port: string): Promise<boolean> {
  const paths = piStompSetPaths(instance, port);
  for (const path of paths.slice(0, 1)) {
    try {
      const res = await fetch(apiUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: 0 }),
      });
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text === "true" || text === "True") return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Stomp: MOD host :bypass first (same as early 0.2.x — reliable on Pi-Stomp),
 * then native BYPASS/bypass/enable for plugins that mirror it (e.g. CollisionDrive, Calf).
 */
export async function setPluginBypass(plugin: EffectPlugin, bypassed: boolean): Promise<boolean> {
  noteBypassCommand(plugin.instance, bypassed);
  pushControlLog(`stomp ${plugin.instance} :bypass=${bypassed ? 1 : 0}`);
  const hostOk = await setBypass(plugin.instance, bypassed);
  const native = findNativeBypassPort(plugin);
  if (!native) return hostOk;
  const value = nativeBypassValueForTarget(plugin, native, bypassed);
  pushControlLog(`stomp ${plugin.instance}/${native}=${value}`);
  const nativeOk = await setParameter(plugin.instance, native, value);
  return hostOk || nativeOk;
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

/**
 * `/pedalboard/info/` is disk metadata (stale bypass/params on Pi and MOD Desktop).
 * On routine refresh, keep live values from the UI + WebSocket; use `replace` when switching boards.
 */
export function mergePluginsPreservingLiveState(
  prev: EffectPlugin[],
  next: EffectPlugin[],
): EffectPlugin[] {
  if (prev.length === 0) return next;
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
  opts?: { replace?: boolean },
): EffectPlugin[] {
  const base = opts?.replace ? [] : prev;
  return stabilizePluginOrder(base, mergePluginsPreservingLiveState(base, fromInfo));
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
let wsLastClose = "(never connected)";
const wsListeners = new Set<WSListener>();

/** Ports that duplicate the stomp (host bypass) or are gate-on/off, not tone knobs. */
const DUPLICATE_STOMP_PORTS = /^(gate|bypass|enable|onoff|on_off|mute)$/i;

const controlLog: string[] = [];
const wsInLog: string[] = [];
const MAX_LOG = 48;

export function pushControlLog(message: string): void {
  const row = `${new Date().toISOString().slice(11, 23)} ${message}`;
  controlLog.push(row);
  if (controlLog.length > MAX_LOG) controlLog.shift();
}

export function getControlLog(): string[] {
  return [...controlLog];
}

function pushWsInLog(message: string): void {
  if (message === "pong") return;
  const row = `${new Date().toISOString().slice(11, 23)} ← ${message.slice(0, 120)}`;
  wsInLog.push(row);
  if (wsInLog.length > MAX_LOG) wsInLog.shift();
}

export function getWebSocketDiagnostics(): string[] {
  const state = ws?.readyState;
  const stateLabel =
    state === WebSocket.OPEN
      ? "OPEN"
      : state === WebSocket.CONNECTING
        ? "CONNECTING"
        : state === WebSocket.CLOSING
          ? "CLOSING"
          : state === WebSocket.CLOSED
            ? "CLOSED"
            : "null";
  return [
    `  socket: ${stateLabel}`,
    `  last close: ${wsLastClose}`,
    `  ws warmed: ${wsWarmAttempted}`,
    `  listener count: ${wsListeners.size}`,
    `  recent inbound (last ${wsInLog.length}):`,
    ...(wsInLog.length ? wsInLog.map((l) => `    ${l}`) : ["    (none yet)"]),
  ];
}

export function formatWsParamLine(instance: string, port: string, value: number): string {
  return wsParamMessage(instance, port, value);
}

async function fetchProbe(path: string, init?: RequestInit): Promise<string> {
  try {
    const res = await fetch(apiUrl(path), { ...init, signal: AbortSignal.timeout(5000) });
    const text = (await res.text()).trim().replace(/\s+/g, " ").slice(0, 160);
    return `  ${path} → HTTP ${res.status} ${text || "(empty)"}`;
  } catch (e) {
    return `  ${path} → ERROR ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function probePiStompSet(
  instance: string,
  port: string,
  value: number,
): Promise<string[]> {
  const lines: string[] = [];
  for (const path of piStompSetPaths(instance, port)) {
    const bodies =
      port === ":bypass"
        ? [{ value: value >= 0.5 ? "1" : "0" }, { value }]
        : [{ value }];
    for (const body of bodies) {
      try {
        const res = await fetch(apiUrl(path), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        const text = (await res.text()).trim().slice(0, 80);
        lines.push(`  POST ${path} body=${JSON.stringify(body)} → ${res.status} ${text}`);
      } catch (e) {
        lines.push(`  POST ${path} → ERROR ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return lines;
}

/** Safe HTTP probes for Settings QA (never calls /reset — that wipes the live graph). */
export async function runConnectionProbes(
  plugin: EffectPlugin | undefined,
  opts?: { includePiStompHttpProbes?: boolean },
): Promise<string[]> {
  const includePiStompHttp = opts?.includePiStompHttpProbes ?? true;
  const lines: string[] = [];
  lines.push("  (skipped GET /reset/ — destructive; clears all effects on the Pi)");
  lines.push(await fetchProbe("/pedalboard/current"));
  lines.push(await fetchProbe("/pistomp-last.json"));
  lines.push(await fetchProbe("/pistomp/audio/controls"));
  lines.push(await fetchProbe("/pistomp/wifi/status"));

  if (!plugin) {
    lines.push("  (no plugin — load a pedalboard first)");
    return lines;
  }

  const tonePort =
    plugin.ports.find(
      (p) =>
        p.valid !== false &&
        !p.symbol.startsWith(":") &&
        !DUPLICATE_STOMP_PORTS.test(p.symbol),
    ) ?? plugin.ports[0];

  lines.push(`  probe plugin: instance="${plugin.instance}"`);
  const nativeBypass = findNativeBypassPort(plugin);
  if (nativeBypass) {
    lines.push(`  native bypass port: ${nativeBypass} (stomp should use this, not GATE)`);
    lines.push(
      `  WS line (native bypass): ${formatWsParamLine(plugin.instance, nativeBypass, 1)}`,
    );
  }
  lines.push(`  WS line (host :bypass): ${formatWsParamLine(plugin.instance, ":bypass", 1)}`);
  if (tonePort) {
    lines.push(
      `  WS line (param): ${formatWsParamLine(plugin.instance, tonePort.symbol, tonePort.value)}`,
    );
  }

  if (includePiStompHttp) {
    lines.push("  pi_stomp_set bypass probes:");
    lines.push(...(await probePiStompSet(plugin.instance, ":bypass", plugin.bypassed ? 0 : 1)));

    if (tonePort) {
      const testVal = Math.min(tonePort.maximum ?? 1, Math.max(tonePort.minimum ?? 0, tonePort.value));
      lines.push(`  pi_stomp_set param "${tonePort.symbol}" probe:`);
      lines.push(...(await probePiStompSet(plugin.instance, tonePort.symbol, testVal)));
    }

    const getPath = `/effect/parameter/pi_stomp_get//graph${piStompInstanceSuffix(plugin.instance)}/:bypass`;
    lines.push(await fetchProbe(getPath));
  } else {
    lines.push("  (skipped pi_stomp_set HTTP probes — use WebSocket stomps on this Pi)");
  }

  return lines;
}

/**
 * MOD-UI expects clients to answer keepalive / handshake traffic.
 * @see pi-stomp modalapi/websocket_bridge.py (_receive_messages)
 */
function handleModWsProtocol(socket: WebSocket, msg: string): boolean {
  if (msg === "ping") {
    socket.send("pong");
    return true;
  }
  if (msg.startsWith("data_ready ")) {
    socket.send(msg);
    return true;
  }
  return false;
}

function attachSocket(socket: WebSocket): void {
  socket.onmessage = (ev) => {
    const msg = String(ev.data);
    if (handleModWsProtocol(socket, msg)) {
      if (msg !== "ping") pushWsInLog(`(echo) ${msg}`);
      return;
    }
    pushWsInLog(msg);
    for (const fn of wsListeners) fn(msg);
  };
  socket.onclose = (ev) => {
    wsLastClose = `code=${ev.code} reason=${ev.reason || "(none)"}`;
    pushControlLog(`WebSocket closed ${wsLastClose}`);
    ws = null;
    wsConnectPromise = null;
    notifyWebSocketStatus();
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
      pushControlLog(`WebSocket open ${url}`);
      notifyWebSocketStatus();
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

/** Outbound WS — pi-stomp bridge uses a single slash path (see websocket_bridge.send_parameter). */
export function wsParamMessage(instance: string, portSymbol: string, value: number): string {
  const bare = normalizeWsInstance(instance).replace(/^\//, "");
  const sym = portSymbol.startsWith(":") ? portSymbol : portSymbol.replace(/^\//, "");
  return `param_set /graph/${bare}/${sym} ${value}`;
}

async function sendWsParam(instance: string, portSymbol: string, value: number): Promise<void> {
  const socket = await ensureWebSocket();
  const line = wsParamMessage(instance, portSymbol, value);
  pushControlLog(`WS → ${line}`);
  socket.send(line);
}

async function tryWebSocketParam(
  instance: string,
  port: string,
  value: number,
): Promise<boolean> {
  try {
    await sendWsParam(instance, port, value);
    return true;
  } catch (e) {
    pushControlLog(`WS failed ${instance}/${port}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export function connectWebSocket(onMessage: WSListener): () => void {
  wsListeners.add(onMessage);
  warmWebSocketForLiveSession();
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
  let lastErr: Error | null = null;
  for (const path of ["/reset/", "/reset"]) {
    try {
      const res = await fetch(apiUrl(path));
      const text = (await res.text()).trim();
      if (!res.ok) {
        lastErr = new Error(`reset ${path}: HTTP ${res.status}`);
        continue;
      }
      if (text.startsWith("<")) {
        lastErr = new Error(
          `reset ${path} returned HTML — nginx may not proxy /reset to MOD (re-run install-on-pistomp.sh)`,
        );
        continue;
      }
      if (text === "true" || text === "True") return;
      try {
        if (JSON.parse(text) === true) return;
      } catch {
        /* not JSON */
      }
      lastErr = new Error(`reset ${path}: unexpected body ${text.slice(0, 40)}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("reset failed");
    }
  }
  throw lastErr ?? new Error("reset failed");
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
  await delay(isPiStompMode() ? 1200 : 450);
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

/** Pi-Stomp writes ~/data/last.json when the loaded board changes (nginx serves as /pistomp-last.json). */
async function getCurrentFromPiLastJson(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl("/pistomp-last.json"));
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
    return getCurrentFromPiLastJson();
  }
  return getCurrentFromModLastJson();
}

export async function resolveCurrentBundle(fallbackBundle: string): Promise<string> {
  return (await getCurrentPedalboardBundle()) ?? fallbackBundle;
}

async function fetchEffectGetMeta(uri: string): Promise<unknown> {
  const q = new URLSearchParams({ uri });
  return request<unknown>(`/effect/get?${q}`);
}

export async function getPedalboardInfo(bundlepath: string): Promise<PedalboardInfo> {
  const q = new URLSearchParams({ bundlepath });
  const info = await request<PedalboardInfo>(`/pedalboard/info/?${q}`);
  info.plugins = info.plugins.map((p) => normalizePluginPorts(p));
  info.plugins = await enrichPluginsWithColors(info.plugins);
  info.plugins = await enrichPluginPortRanges(info.plugins, fetchEffectGetMeta);
  return info;
}

/** Pi load_bundle can lag; retry before showing an empty grid. */
export async function getPedalboardInfoWithRetry(
  bundlepath: string,
  attempts = 8,
): Promise<PedalboardInfo> {
  let last = await getPedalboardInfo(bundlepath);
  if (!isPiStompMode() || last.plugins.length > 0) return last;
  for (let i = 1; i < attempts; i++) {
    await delay(i < 3 ? 400 : 600);
    last = await getPedalboardInfo(bundlepath);
    if (last.plugins.length > 0) return last;
  }
  return last;
}

/** Pedalboard info for the bundle you asked for (not /pedalboard/current, which is often empty on Pi). */
export async function getLivePedalboardState(
  bundlepath: string,
): Promise<{ bundle: string; info: PedalboardInfo }> {
  const info = isPiStompMode()
    ? await getPedalboardInfoWithRetry(bundlepath)
    : await getPedalboardInfo(bundlepath);
  return { bundle: bundlepath, info };
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

/**
 * Pi-Stomp MOD patch: direct host param_set / bypass (same as pi-stomp LCD/footswitches).
 * @see pi-stomp/GUIDE.md — POST /effect/parameter/pi_stomp_set//graph{id}/{symbol}
 */
async function postPiStompSetOnce(path: string, body: { value: number | string }): Promise<boolean> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  const text = (await res.text()).trim();
  if (text.startsWith("<")) return false;
  if (!text) return true;
  try {
    const ok = JSON.parse(text);
    return ok === true || ok === "true";
  } catch {
    return text === "true" || text === "True";
  }
}

async function postPiStompSet(path: string, value: number, port: string): Promise<boolean> {
  const bodies: { value: number | string }[] = [{ value }];
  if (port === ":bypass") {
    bodies.unshift({ value: value >= 0.5 ? "1" : "0" });
  }
  for (const body of bodies) {
    if (await postPiStompSetOnce(path, body)) return true;
  }
  return false;
}

async function setParameterViaPiStomp(
  instance: string,
  port: string,
  value: number,
): Promise<boolean> {
  const paths = [...new Set(piStompSetPaths(instance, port))];
  for (const path of paths) {
    if (await postPiStompSet(path, value, port)) return true;
  }
  return false;
}

/** Pi-Stomp: WS when connected (live engine), then HTTP paramhmi_set, then pi_stomp_set. */
async function setParameterOnPi(instance: string, port: string, value: number): Promise<boolean> {
  pushControlLog(`set param ${instance}/${port}=${value}`);
  if (isWebSocketOpen()) {
    if (await tryWebSocketParam(instance, port, value)) return true;
  }
  if (await setParameterViaHttp(instance, port, value)) {
    pushControlLog(`HTTP set ${instance}/${port} → true`);
    return true;
  }
  return setParameterViaPiStomp(instance, port, value);
}

async function setBypassOnPi(instance: string, value: number): Promise<boolean> {
  pushControlLog(`set host bypass ${instance}=${value}`);
  if (isWebSocketOpen()) {
    if (await tryWebSocketParam(instance, ":bypass", value)) return true;
  }
  if (await setParameterViaHttp(instance, ":bypass", value)) {
    pushControlLog(`HTTP bypass ${instance} → true`);
    return true;
  }
  return setParameterViaPiStomp(instance, ":bypass", value);
}

export async function setBypass(instance: string, bypassed: boolean): Promise<boolean> {
  const value = bypassed ? 1 : 0;
  if (isPiStompMode()) {
    noteBypassCommand(instance, bypassed);
    return setBypassOnPi(instance, value);
  }
  try {
    await sendWsParam(instance, ":bypass", value);
    return true;
  } catch {
    if (!isModDesktopMode()) {
      return setParameterViaHttp(instance, ":bypass", value);
    }
    return false;
  }
}

export async function setParameter(
  instance: string,
  port: string,
  value: number,
): Promise<boolean> {
  if (isPiStompMode()) {
    return setParameterOnPi(instance, port, value);
  }
  try {
    await sendWsParam(instance, port, value);
    return true;
  } catch {
    if (!isModDesktopMode()) {
      return setParameterViaHttp(instance, port, value);
    }
    return false;
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
      !p.symbol.startsWith(":") &&
      !DUPLICATE_STOMP_PORTS.test(p.symbol),
  );
}

/** Apply inbound bypass from MOD WebSocket if it matches a plugin and is not a stale echo. */
export function applyInboundBypass(
  plugins: EffectPlugin[],
  instance: string,
  bypassed: boolean,
): EffectPlugin[] | null {
  if (!shouldApplyInboundBypass(instance, bypassed)) return null;
  let matched = false;
  const next = plugins.map((p) => {
    if (!instanceIdsMatch(p.instance, instance)) return p;
    matched = true;
    return { ...p, bypassed };
  });
  return matched ? next : null;
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
